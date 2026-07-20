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

/** Altura da lista no telemóvel. Em `dvh` — com `vh`, a barra do browser
 *  cortava o compositor exactamente quando o teclado abria. */
const ALTURA_LISTA = "max-h-[55dvh] md:max-h-none md:flex-1";

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
  className?: string;
};

export function ChatPanel({
  eventId,
  viewerId,
  initial,
  transport,
  closedNotice,
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

  const fundoRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<HTMLTextAreaElement>(null);
  /* Guardado em ref e não em estado: o `follow` do transporte lê isto dentro de
     um callback que só se regista uma vez, e um estado ficaria congelado no
     valor do primeiro render. */
  const aAcompanhar = useRef(true);

  const irParaOFundo = useCallback((comportamento: ScrollBehavior = "smooth") => {
    fundoRef.current?.scrollIntoView({ behavior: comportamento, block: "end" });
    aAcompanhar.current = true;
    setPorLer(0);
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
    if (quantasMensagens > 0 && aAcompanhar.current) {
      fundoRef.current?.scrollIntoView({ block: "end" });
    }
  }, [quantasMensagens]);

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
        "flex min-h-0 flex-col overflow-hidden rounded-sm border border-input bg-card",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-input px-3 py-2">
        <h2 className="font-display text-2sm font-bold tracking-display">{TITULO[phase]}</h2>
        {emLive ? (
          <span className="font-mono text-2xs uppercase tracking-label text-muted-foreground">
            {messages.length} {messages.length === 1 ? "mensagem" : "mensagens"}
          </span>
        ) : null}
      </header>

      <ol
        onScroll={aoRolar}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5", ALTURA_LISTA)}
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
        <div ref={fundoRef} />
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
                /* O caso difícil do telemóvel: com o teclado aberto, o
                   compositor tem de continuar à vista. `block: "nearest"` deixa
                   o browser fazer o mínimo para o mostrar. */
                compositorRef.current?.scrollIntoView({ block: "nearest" });
                irParaOFundo("auto");
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
