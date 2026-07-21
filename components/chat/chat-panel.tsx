"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessageRow } from "@/components/chat/chat-message-row";
import { type ChatTransport, httpPollingTransport } from "@/components/chat/chat-transport";
import { Button } from "@/components/ui/button";
import {
  CHAT_BODY_MAX_CHARS,
  type ChatMessageView,
  type ChatPhase,
  type ChatSnapshot,
} from "@/lib/chat";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  O PAINEL DA CONVERSA — chat ao vivo e comentários do VOD, o mesmo componente
 * ============================================================================
 *
 * Não são duas coisas. É a mesma conversa, sobre o mesmo evento, na mesma
 * tabela, com a mesma moderação e as mesmas regras de acesso — só muda o ritmo
 * a que chega ao ecrã:
 *
 *   live    — segue o fluxo do transporte (hoje, polling de 4s)
 *   arquivo — carrega ao abrir e tem "carregar mais antigas"; sem fluxo contínuo
 *   fechado — lê-se, não se escreve
 *
 * Dois componentes queriam dizer duas correções por cada bug, e duas hipóteses
 * de a moderação passar a comportar-se de maneira diferente conforme o estado
 * do evento. A fase é um `prop` derivado do servidor, não um componente.
 *
 * ⚠️ COMO AS MENSAGENS CHEGAM não se decide aqui: decide-se em
 * `chat-transport.ts`, atrás da interface `ChatTransport`. Este ficheiro nunca
 * fala em polling, cursores nem `fetch` — é o que permite trocar para SSE ou
 * para um serviço externo sem lhe tocar.
 */

// ── Números com nome ────────────────────────────────────────────────────────

/** A que distância do fundo ainda se considera que a pessoa está a acompanhar. */
const LIMIAR_FUNDO_PX = 48;

/** A partir de quantos caracteres restantes o contador aparece. */
const AVISAR_A_FALTAR = 40;

/**
 * Onde a conversa é desenhada. Não são dois painéis — é o mesmo painel com duas
 * apresentações, porque é a mesma conversa, com as mesmas regras e o mesmo
 * estado. Duas cópias queriam dizer dois `follow()` a ler a base de dados, duas
 * listas a divergirem e a mensagem por enviar a perder-se ao entrar em ecrã
 * inteiro.
 *
 *   coluna     — ao lado do vídeo (ou por baixo, no telemóvel)
 *   sobreposto — por cima do vídeo, em ecrã inteiro
 */
export type VarianteChat = "coluna" | "sobreposto";

/**
 * Altura da lista, por apresentação. Em `dvh` — com `vh`, a barra do browser
 * cortava o compositor exactamente quando o teclado abria.
 *
 * `lg` e não `md`, e isso é uma correção: até aos 1024px a conversa fica por
 * baixo do vídeo numa coluna só, e a partir dos 768 o `md:max-h-none` tirava-lhe
 * o tecto sem lhe dar altura nenhuma em troca. Medido a 768×1024 com 74
 * mensagens: o painel ficava com 1799px de altura, a lista não rolava por
 * dentro (`scrollHeight === clientHeight`) e o documento ia a 2599px. O "rola
 * por dentro" só passa a existir a partir de `lg`, que é onde a célula da
 * grelha tem finalmente uma altura própria — a do vídeo.
 *
 * No sobreposto não há tecto a negociar: a caixa tem altura fixa e a lista
 * ocupa o que sobra entre o cabeçalho e o compositor.
 */
const ALTURA_LISTA: Record<VarianteChat, string> = {
  coluna: "max-h-[55dvh] lg:max-h-none lg:flex-1",
  sobreposto: "flex-1",
};

/**
 * A moldura do painel, por apresentação.
 *
 * O sobreposto é o mesmo cartão com o fundo a deixar passar um pouco do vídeo —
 * não é um estilo novo, é o `bg-card` com transparência. Nada de desfoque nem
 * de gradiente: o fundo do espectador já é escuro, o contraste do texto está
 * medido contra ele, e o desfoque criava contexto de empilhamento em cima da
 * marca de água (ver `Z_MARCA` em `watermark.tsx`).
 */
const MOLDURA: Record<VarianteChat, string> = {
  coluna: "border-input bg-card",
  sobreposto: "border-bar-border bg-card/92",
};

const TITULO: Record<ChatPhase, string> = {
  live: "Chat ao vivo",
  arquivo: "Comentários",
  fechado: "Comentários",
};

const PLACEHOLDER: Record<ChatPhase, string> = {
  live: "Escreve no chat",
  arquivo: "Escreve um comentário",
  fechado: "",
};

const VAZIO: Record<ChatPhase, string> = {
  live: "Ainda ninguém falou. Abre tu a conversa.",
  arquivo: "Ainda não há comentários neste evento.",
  fechado: "Não houve mensagens neste evento.",
};

/** Junta o que chegou ao que já lá estava: sem repetidos, por ordem. */
function juntar(atuais: ChatMessageView[], novas: ChatMessageView[]): ChatMessageView[] {
  if (novas.length === 0) return atuais;

  const porId = new Map(atuais.map((m) => [m.id, m]));
  for (const nova of novas) porId.set(nova.id, nova);

  return [...porId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

export type ChatPanelProps = {
  eventId: string;
  /** Quem está a ver — marca as próprias mensagens. */
  viewerId: string;
  /** A leitura feita no servidor: o primeiro ecrã já vem com a conversa. */
  initial: ChatSnapshot;
  /**
   * O transporte. Por omissão, polling HTTP. É por aqui que entra um `sse-` ou
   * um `pusherTransport` no dia em que fizer sentido — ver `chat-transport.ts`.
   */
  transport?: ChatTransport;
  /** O que dizer quando a fase é `fechado` (a página sabe porquê). */
  closedNotice?: string;
  /** Onde está a ser desenhado. Só muda a apresentação — ver `VarianteChat`. */
  variante?: VarianteChat;
  /**
   * Fechar o painel. Só faz sentido no sobreposto, e é lá que aparece o botão.
   *
   * Existe por acessibilidade, não por decoração: o interruptor que abre o chat
   * vive nos controlos do leitor, que se escondem sozinhos. Enquanto o chat
   * está aberto tem de haver uma maneira de o fechar que esteja SEMPRE à vista
   * e no caminho do teclado — sem depender de passar o rato por cima de nada.
   */
  onFechar?: () => void;
  className?: string;
};

export function ChatPanel({
  eventId,
  viewerId,
  initial,
  transport,
  closedNotice,
  variante = "coluna",
  onFechar,
  className,
}: ChatPanelProps) {
  const feed = useMemo(() => transport ?? httpPollingTransport(eventId), [transport, eventId]);

  const [messages, setMessages] = useState<ChatMessageView[]>(initial.messages);
  const [phase, setPhase] = useState<ChatPhase>(initial.phase);
  const [canWrite, setCanWrite] = useState(initial.canWrite);
  const [mutedUntil, setMutedUntil] = useState<string | null>(initial.mutedUntil);
  const [moderator, setModerator] = useState(initial.moderator);
  const [hasOlder, setHasOlder] = useState(initial.hasOlder);

  const [rascunho, setRascunho] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const [aModerar, setAModerar] = useState<string | null>(null);
  const [aCarregarAntigas, setACarregarAntigas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [porLer, setPorLer] = useState(0);

  const listaRef = useRef<HTMLOListElement>(null);
  const compositorRef = useRef<HTMLTextAreaElement>(null);
  /* Guardado em ref e não em estado: o `follow` do transporte lê isto dentro de
     um callback que só se regista uma vez, e um estado ficaria congelado no
     valor do primeiro render. */
  const aAcompanhar = useRef(true);

  /*
   * Rolar a LISTA, e só a lista.
   *
   * Isto era `fundoRef.scrollIntoView({ block: "end" })` e o `scrollIntoView`
   * não pára no elemento com scroll: sobe a árvore e rola também o DOCUMENTO,
   * até deixar o fim da lista encostado ao fundo da janela. Como o compositor
   * vem DEPOIS da lista, ficava empurrado para fora do ecrã — medido a 375x812
   * com o campo focado: topo do compositor em y=821, ou seja abaixo da própria
   * janela (812) e 309px abaixo da linha de um teclado de iPhone (512).
   *
   * E acontecia a cada mensagem nova: quem estivesse a ler a descrição do
   * evento via a página saltar sozinha de dois em dois segundos.
   *
   * `scrollTop` faz o que era preciso desde o início — mover a lista por
   * dentro — sem tocar na posição da página.
   */
  const irParaOFundo = useCallback((comportamento: ScrollBehavior = "smooth") => {
    const lista = listaRef.current;
    if (lista) lista.scrollTo({ top: lista.scrollHeight, behavior: comportamento });
    aAcompanhar.current = true;
    setPorLer(0);
  }, []);

  /*
   * Manter o compositor à vista quando o teclado abre.
   *
   * Por omissão — em todos os browsers, iOS incluído — o teclado encolhe a
   * viewport VISUAL e deixa a de layout como estava. Quer dizer que nenhuma
   * unidade CSS dá por ele: `100dvh` continua a valer o ecrã inteiro e nada no
   * desenho encolhe. Quem sabe onde acaba a área visível é a `visualViewport`,
   * e é a ela que se pergunta.
   *
   * O ajuste vai por `window.scrollBy` em vez de `scrollIntoView` no campo: o
   * `scrollIntoView` decide sozinho quanto rola e, com o teclado aberto, tanto
   * pode parar a meio como saltar demais. Aqui move-se exactamente o que falta.
   */
  const manterCompositorAVista = useCallback(() => {
    const campo = compositorRef.current;
    if (!campo) return;
    const vv = window.visualViewport;
    if (!vv) {
      campo.scrollIntoView({ block: "nearest" });
      return;
    }

    /*
     * Quanto do ecrã é que o teclado está a tapar. É a diferença entre a
     * viewport de LAYOUT (que o teclado não mexe) e a VISUAL (que ele encolhe)
     * — e é zero quando não há teclado, ou quando o browser encolhe as duas.
     * Por isso a mesma conta serve os dois comportamentos sem os distinguir.
     */
    const tapado = Math.max(0, window.innerHeight - vv.height);
    /*
     * A folga que se dá ao documento para ele PODER rolar o suficiente. Sem
     * ela a página chega ao fim antes de o campo passar acima do teclado (ver
     * a nota do `body` em globals.css). Escrita numa variável CSS em vez de um
     * estilo directo no elemento porque quem a consome é o `body`, que não é
     * deste componente — e assim há um só nome para a coisa.
     */
    document.documentElement.style.setProperty("--altura-teclado", `${tapado}px`);

    // Folga de 12px para o campo não ficar colado à aresta do teclado.
    const fundoVisivel = vv.offsetTop + vv.height - 12;
    const r = campo.getBoundingClientRect();
    if (r.bottom > fundoVisivel)
      window.scrollBy({ top: r.bottom - fundoVisivel, behavior: "auto" });
  }, []);

  /** Devolver o espaço ao sair do campo — o teclado fechou, a folga sobra. */
  const largarOTeclado = useCallback(() => {
    document.documentElement.style.removeProperty("--altura-teclado");
  }, []);

  /** Aplica uma leitura do servidor: mensagens novas, apagadas e estado. */
  const aplicar = useCallback(
    (snapshot: ChatSnapshot) => {
      setPhase(snapshot.phase);
      setCanWrite(snapshot.canWrite);
      setMutedUntil(snapshot.mutedUntil);
      setModerator(snapshot.moderator);

      const apagadas = new Set(snapshot.deletedIds);

      setMessages((atuais) => {
        // A moderação tem de se ver em direto: sem isto, uma mensagem apagada
        // ficava no ecrã de quem já a tinha recebido.
        const vivas = apagadas.size > 0 ? atuais.filter((m) => !apagadas.has(m.id)) : atuais;
        const juntas = juntar(vivas, snapshot.messages);

        const chegaramNovas = snapshot.messages.some((m) => m.authorId !== viewerId);
        if (chegaramNovas && !aAcompanhar.current) {
          setPorLer((n) => n + snapshot.messages.length);
        }
        return juntas;
      });
    },
    [viewerId],
  );

  // Primeira leitura no cliente: reconcilia o que veio do servidor e, sobretudo,
  // dá ao transporte a sua posição de partida.
  useEffect(() => {
    let vivo = true;
    feed
      .open()
      .then((snapshot) => {
        if (vivo) aplicar(snapshot);
      })
      .catch(() => {
        // O ecrã já tem a leitura do servidor; falhar aqui não é motivo para
        // assustar ninguém. O `follow` volta a tentar.
      });
    return () => {
      vivo = false;
    };
  }, [feed, aplicar]);

  /*
   * O fluxo contínuo — só na live. No arquivo os comentários não correm, e um
   * poll de 4 segundos sobre um evento que acabou há três semanas seria custo
   * sem nada em troca.
   */
  useEffect(() => {
    if (phase !== "live") return;
    return feed.follow({
      onSnapshot: (snapshot) => {
        setErro(null);
        aplicar(snapshot);
      },
      onError: setErro,
    });
  }, [feed, phase, aplicar]);

  /*
   * Acompanhar o fundo enquanto a pessoa lá estiver.
   *
   * A dependência é o NÚMERO de mensagens e não o array: é o que muda quando
   * chega uma mensagem nova, e é lido aqui dentro — um array na lista de
   * dependências sem ser usado no corpo é o que o lint (com razão) recusa.
   */
  const quantasMensagens = messages.length;
  useEffect(() => {
    const lista = listaRef.current;
    if (lista && quantasMensagens > 0 && aAcompanhar.current) {
      lista.scrollTop = lista.scrollHeight;
    }
  }, [quantasMensagens]);

  /*
   * O teclado não abre no instante do `focus` — abre uns milissegundos depois,
   * e é a `visualViewport` que muda quando ele aparece. Sem ouvir esse evento,
   * o ajuste feito no `focus` era calculado com a janela ainda inteira e não
   * corrigia nada. Só enquanto o campo está focado: fora disso não há teclado
   * para compensar e o ouvinte era peso morto.
   */
  const [aEscrever, setAEscrever] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!aEscrever || !vv) return;
    const ajustar = () => manterCompositorAVista();
    vv.addEventListener("resize", ajustar);
    vv.addEventListener("scroll", ajustar);
    return () => {
      vv.removeEventListener("resize", ajustar);
      vv.removeEventListener("scroll", ajustar);
      // Desmontar a página com o campo focado (mudar de evento a meio de
      // escrever) deixava a folga do teclado colada ao body para sempre.
      largarOTeclado();
    };
  }, [aEscrever, manterCompositorAVista, largarOTeclado]);

  function aoRolar(evento: React.UIEvent<HTMLOListElement>) {
    const alvo = evento.currentTarget;
    const distancia = alvo.scrollHeight - alvo.scrollTop - alvo.clientHeight;
    const noFundo = distancia <= LIMIAR_FUNDO_PX;
    aAcompanhar.current = noFundo;
    if (noFundo) setPorLer(0);
  }

  async function enviar() {
    const corpo = rascunho.trim();
    if (!corpo || aEnviar) return;

    setAEnviar(true);
    setErro(null);
    try {
      const mensagem = await feed.send(corpo);
      setRascunho("");
      setMessages((atuais) => juntar(atuais, [mensagem]));
      irParaOFundo();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível enviar.");
    } finally {
      setAEnviar(false);
    }
  }

  async function moderar(mensagem: ChatMessageView, acao: "apagar" | "silenciar") {
    setAModerar(mensagem.id);
    setErro(null);
    try {
      if (acao === "apagar") {
        await feed.remove(mensagem.id);
        setMessages((atuais) => atuais.filter((m) => m.id !== mensagem.id));
      } else {
        await feed.mute(mensagem.authorId);
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "A moderação falhou.");
    } finally {
      setAModerar(null);
    }
  }

  async function carregarAntigas() {
    const maisAntiga = messages[0];
    if (!maisAntiga || aCarregarAntigas) return;

    setACarregarAntigas(true);
    try {
      const pagina = await feed.older(`${maisAntiga.createdAt}|${maisAntiga.id}`);
      setMessages((atuais) => juntar(atuais, pagina.messages));
      setHasOlder(pagina.hasOlder);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível carregar.");
    } finally {
      setACarregarAntigas(false);
    }
  }

  const restantes = CHAT_BODY_MAX_CHARS - rascunho.length;
  const emLive = phase === "live";

  return (
    <section
      aria-label={TITULO[phase]}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-sm border",
        MOLDURA[variante],
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-input px-3 py-2">
        <h2 className="font-display text-2sm font-bold tracking-display">{TITULO[phase]}</h2>
        <div className="flex items-center gap-2">
          {emLive ? (
            <span className="font-mono text-2xs uppercase tracking-label text-muted-foreground">
              {messages.length} {messages.length === 1 ? "mensagem" : "mensagens"}
            </span>
          ) : null}
          {onFechar ? (
            <button
              type="button"
              onClick={onFechar}
              // Sempre visível enquanto o painel estiver aberto: é o caminho
              // que não depende de hover nenhum. Ver `onFechar`.
              aria-label="Fechar o chat"
              title="Fechar o chat (c)"
              aria-keyshortcuts="c"
              className="alvo-toque -mr-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IconeFechar />
            </button>
          ) : null}
        </div>
      </header>

      <ol
        ref={listaRef}
        onScroll={aoRolar}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5",
          ALTURA_LISTA[variante],
        )}
        /*
         * Anunciar só enquanto a pessoa está a acompanhar o fundo. Um chat de
         * batalha com o leitor de ecrã a ler TUDO, sempre, é inutilizável — e
         * quem rolou para trás está a ler outra coisa e não quer ser
         * interrompido. Quando não acompanha, o aviso é o botão "novas".
         */
        aria-live={emLive && porLer === 0 ? "polite" : "off"}
        aria-relevant="additions"
      >
        {hasOlder ? (
          <li className="px-3 py-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={aCarregarAntigas}
              onClick={carregarAntigas}
            >
              {aCarregarAntigas ? "A carregar…" : "Carregar mensagens anteriores"}
            </Button>
          </li>
        ) : null}

        {messages.length === 0 ? (
          <li className="px-3 py-6 text-center text-2sm text-muted-foreground">{VAZIO[phase]}</li>
        ) : null}

        {messages.map((mensagem, indice) => {
          // A fronteira entre o que se disse DURANTE a transmissão e o que foi
          // comentado depois dela. Fora da live, é o que separa o histórico do
          // chat dos comentários novos — sem precisar de duas tabelas nem de
          // saber a que horas o evento acabou (ver `during_live` no schema).
          const marco = separador(mensagem, messages[indice - 1], emLive);

          return (
            <Fragment key={mensagem.id}>
              {marco ? (
                <li
                  aria-hidden
                  className="flex items-center gap-2 px-3 pt-3 pb-1 font-mono text-2xs uppercase tracking-label text-muted-foreground"
                >
                  <span className="h-px flex-1 bg-border" />
                  {marco}
                  <span className="h-px flex-1 bg-border" />
                </li>
              ) : null}
              <ChatMessageRow
                message={mensagem}
                viewerId={viewerId}
                moderator={moderator}
                busy={aModerar === mensagem.id}
                onDelete={(m) => moderar(m, "apagar")}
                onMute={(m) => moderar(m, "silenciar")}
              />
            </Fragment>
          );
        })}
      </ol>

      {/* Aviso de mensagens novas para quem rolou para trás. É `status` para o
          leitor de ecrã o anunciar uma vez, em vez de ler cada mensagem. */}
      {porLer > 0 ? (
        <div className="shrink-0 border-t border-input px-3 py-1.5">
          <Button variant="secondary" size="sm" className="w-full" onClick={() => irParaOFundo()}>
            <span role="status">
              {porLer} {porLer === 1 ? "mensagem nova" : "mensagens novas"}
            </span>
          </Button>
        </div>
      ) : null}

      <footer className="shrink-0 border-t border-input p-2">
        {erro ? (
          <p role="alert" className="mb-2 px-1 text-2xs text-destructive">
            {erro}
          </p>
        ) : null}

        {canWrite ? (
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor={`chat-${eventId}`}>
              {PLACEHOLDER[phase]}
            </label>
            <textarea
              id={`chat-${eventId}`}
              ref={compositorRef}
              rows={1}
              value={rascunho}
              maxLength={CHAT_BODY_MAX_CHARS}
              placeholder={PLACEHOLDER[phase]}
              disabled={aEnviar}
              onChange={(e) => setRascunho(e.target.value)}
              onFocus={() => {
                /*
                 * A ORDEM importa, e era ela que estava trocada. O
                 * `irParaOFundo` corria depois e desfazia o trabalho do
                 * `scrollIntoView` do campo — rolava o documento até ao fim da
                 * lista e mandava o compositor para baixo do teclado.
                 *
                 * Agora a lista vai ao fundo por dentro (sem mexer na página) e
                 * só depois se acerta a posição da página para o campo ficar à
                 * vista. Ver `manterCompositorAVista`.
                 */
                setAEscrever(true);
                irParaOFundo("auto");
                manterCompositorAVista();
              }}
              onBlur={() => {
                setAEscrever(false);
                largarOTeclado();
              }}
              onKeyDown={(e) => {
                // Enter envia; Shift+Enter muda de linha. É a convenção de chat
                // e é o que o polegar espera no teclado do telemóvel.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              className="h-11 max-h-24 min-h-11 w-full flex-1 resize-none rounded-sm border border-input bg-field px-3 py-2.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 disabled:bg-muted disabled:text-muted-foreground"
            />
            <Button
              size="sm"
              className="h-11 shrink-0"
              disabled={aEnviar || rascunho.trim().length === 0}
              onClick={() => void enviar()}
            >
              Enviar
            </Button>
          </div>
        ) : (
          <p className="px-1 py-1 text-2xs text-muted-foreground">
            {mutedUntil
              ? "Foste silenciado neste evento pela organização da liga."
              : (closedNotice ?? "A conversa deste evento está fechada.")}
          </p>
        )}

        {canWrite && restantes <= AVISAR_A_FALTAR ? (
          <p
            className={cn(
              "mt-1 px-1 text-right font-mono text-2xs tabular-nums",
              restantes === 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {restantes} caracteres
          </p>
        ) : null}
      </footer>
    </section>
  );
}

/*
 * O X de fechar. Traço de 2, `currentColor`, sem preenchimento — a mesma
 * linguagem dos ícones do leitor (`fullscreen-button.tsx`). Nada de emoji: um
 * emoji muda de desenho conforme o sistema e nunca combina com o resto.
 */
function IconeFechar() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * O rótulo do marco antes desta mensagem, ou `null` se não houver marco.
 *
 * Há marco na primeira mensagem da lista e sempre que se passa do que foi dito
 * durante a transmissão para o que foi comentado depois. Na live não há marco
 * nenhum: está tudo "durante a transmissão" e o rótulo seria ruído.
 */
function separador(
  mensagem: ChatMessageView,
  anterior: ChatMessageView | undefined,
  emLive: boolean,
): string | null {
  if (emLive) return null;
  if (anterior && anterior.duringLive === mensagem.duringLive) return null;
  return mensagem.duringLive ? "Durante a transmissão" : "Comentários";
}
