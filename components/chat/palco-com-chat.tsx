"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useDentroDoEcraInteiro } from "@/components/player/fullscreen-button";
import { WatchPlayer } from "@/components/player/watch-player";
import { Z_MARCA } from "@/components/player/watermark";
import type { ChatSnapshot } from "@/lib/chat";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  O PALCO — o vídeo e a conversa, na mesma caixa
 * ============================================================================
 *
 * O que o dono pediu, por palavras dele: «o chat durante a live tem de ser ao
 * lado do vídeo como no YouTube» e «quando estou a ver em ecrã inteiro,
 * conseguir pôr o chat por cima e ativar ou desativar».
 *
 * São dois sítios para a MESMA conversa, e é por isso que existe este ficheiro:
 * sem ele, o chat ao lado e o chat sobreposto seriam dois `ChatPanel` — dois
 * `follow()` a ler a base de dados de 4 em 4 segundos, duas listas a divergirem
 * e a mensagem por enviar perdida sempre que se entrasse em ecrã inteiro. Aqui
 * é UM painel que muda de sítio e de apresentação; o React não o desmonta
 * porque o nó é o mesmo — só lhe mudam as classes e o `variante`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE O ECRÃ INTEIRO É PEDIDO A ESTE ELEMENTO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Em ecrã inteiro o sistema desenha o elemento escolhido **e mais nada**. Era
 * por isso que o pedido tinha deixado de ser feito ao iframe e passado a ser
 * feito à moldura: a marca de água vive fora do iframe e desaparecia (ver
 * `fullscreen-button.tsx`). Pela mesma razão, o chat sobreposto tem de estar
 * dentro do que vai a ecrã inteiro — senão simplesmente não aparece.
 *
 * A solução é subir o alvo um degrau: o palco leva a moldura (com o iframe e a
 * marca lá dentro) **e** o chat. A regra antiga não foi enfraquecida — o alvo
 * continua a conter a marca —, e continua a ser verificada pelo vigia em tempo
 * de execução: se algum dia alguém apontar o ecrã inteiro a um elemento que
 * deixe a marca de fora, o vigia responde `sem-a-marca` e o vídeo pára.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  E A MARCA DE ÁGUA, COM O CHAT POR CIMA DO VÍDEO?
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O vigia corta quando alguém está desenhado À FRENTE da marca. Um painel de
 * chat opaco em cima do vídeo é exatamente isso — e a resposta NÃO podia ser
 * "o chat calha noutro sítio", que é uma conta que depende da largura do ecrã,
 * do comprimento do email e de onde a animação da marca parou.
 *
 * A resposta é de ordem de desenho, e está declarada nos dois lados: a marca
 * tem `Z_MARCA` e o chat fica estritamente abaixo. Se se cruzarem, quem fica à
 * frente é a marca — continua a identificar a sessão, e o vigia não tem motivo
 * para cortar. E se alguém empurrar outra coisa para cima da marca, o vigia
 * continua a ver e a cortar: não se desligou nada.
 *
 * Para isto funcionar, quem cria o contexto de empilhamento é o PALCO (`isolate`
 * — e em ecrã inteiro o browser já cria um). Entre a marca e o palco não pode
 * haver `transform`, `filter`, `opacity` nem `isolate`: qualquer um deles
 * prendia a marca dentro da moldura e ela deixava de se comparar com o chat.
 */

// ── Números com nome ────────────────────────────────────────────────────────

/**
 * O chat sobreposto fica um degrau abaixo da marca de água. Escrito assim, e
 * não como um número solto, para não haver dois sítios a inventar a mesma
 * ordem: quem mandar em `Z_MARCA` manda nisto.
 */
const Z_CHAT_SOBREPOSTO = Z_MARCA - 1;

/** Os controlos do palco ficam acima de tudo — incluindo da marca, como já
 *  ficava o botão de ecrã inteiro do leitor. São 44px num canto onde a marca
 *  nunca chega (o `wm-hop` mantém-na entre os 6% e os 44% da largura). */
const Z_CONTROLOS = Z_MARCA + 15;

/** Quanto tempo os controlos ficam à vista depois do último gesto. */
const ESCONDER_CONTROLOS_MS = 2600;

/**
 * Onde fica lembrado se o chat sobreposto está ligado.
 *
 * `localStorage`, e a decisão tem três razões:
 *   • é uma preferência de APRESENTAÇÃO e do DISPOSITIVO — o mesmo espectador
 *     quer legitimamente respostas diferentes no portátil e no telemóvel, e uma
 *     coluna na conta dava a mesma resposta aos dois;
 *   • não pode influenciar o que o servidor desenha. Num cookie viajava em cada
 *     pedido e entrava no render do servidor — que é onde nascem os desencontros
 *     de hidratação, e onde uma preferência de UI passa a afetar a cache;
 *   • não é informação de ninguém: é um "1" ou um "0" sobre um painel.
 *
 * Lido depois de montar, nunca durante o render. E isso não custa nada aqui: o
 * sobreposto só existe em ecrã inteiro, que exige um gesto do utilizador muito
 * depois da hidratação — não há hipótese de se ver o valor errado a piscar.
 */
const CHAVE_MEMORIA = "firstrow:chat-em-ecra-inteiro";

/**
 * Medidas do palco, num sítio só.
 *
 * `--chat-coluna` é a largura da coluna ao lado do vídeo (os 340px que já lá
 * estavam). `--chat-sobreposto` é a do painel por cima do vídeo: uma fração da
 * largura com tecto, para não comer meio ecrã num portátil nem ficar um risco
 * numa televisão.
 *
 * `--topo-sobreposto` desce o painel para baixo da fila de controlos, e
 * `--recuo-2o-controlo` põe o interruptor do chat imediatamente à esquerda do
 * botão de ecrã inteiro do leitor. Ambos são derivados do `--alvo-toque` (44px)
 * e do recuo de 0.75rem que o botão do leitor usa — ver `fullscreen-button.tsx`.
 * Derivados, e não copiados: mexer no tamanho do alvo de toque mexe nos três.
 */
const MEDIDAS = {
  "--chat-coluna": "21.25rem",
  "--chat-sobreposto": "clamp(17rem, 28vw, 23rem)",
  "--topo-sobreposto": "calc(var(--alvo-toque) + 1.25rem)",
  "--recuo-2o-controlo": "calc(var(--alvo-toque) + 1.25rem)",
} as React.CSSProperties;

export type PalcoComChatProps = {
  eventId: string;
  /** O email do espectador — o que vai escrito na marca de água. */
  watermark: string;
  viewerId: string;
  /** A leitura da conversa feita no servidor. */
  inicial: ChatSnapshot;
  /** Título, descrição, gosto e partilha. Vem montado do servidor. */
  info: React.ReactNode;
};

export function PalcoComChat({ eventId, watermark, viewerId, inicial, info }: PalcoComChatProps) {
  const palcoRef = useRef<HTMLDivElement>(null);
  const dentro = useDentroDoEcraInteiro(palcoRef);

  const [ligado, setLigado] = useState(true);
  const [controlosAVista, setControlosAVista] = useState(true);

  // A memória. Falhar a ler não é motivo para partir nada: em navegação
  // privada, ou com o armazenamento bloqueado, fica o valor por omissão.
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CHAVE_MEMORIA);
      if (guardado !== null) setLigado(guardado === "1");
    } catch {
      /* sem memória — o chat aparece, e desliga-se outra vez se for preciso */
    }
  }, []);

  const alternarChat = useCallback(() => {
    setLigado((anterior) => {
      const novo = !anterior;
      try {
        window.localStorage.setItem(CHAVE_MEMORIA, novo ? "1" : "0");
      } catch {
        /* idem */
      }
      return novo;
    });
  }, []);

  /*
   * O RESTO DA PÁGINA SAI DO CAMINHO DO TAB enquanto estivermos em ecrã inteiro.
   *
   * Medido, e é uma armadilha a sério: em ecrã inteiro o sistema só DESENHA o
   * palco, mas o documento inteiro continua a ser navegável por teclado. Com o
   * rato parado o tempo suficiente para os controlos se esconderem, foram
   * precisos **10 Tabs** para chegar ao interruptor do chat — e os nove
   * anteriores foram para elementos que não estão no ecrã: a navegação da
   * barra, o botão de gosto, o "copiar link". O foco desaparecia.
   *
   * A correção é a de sempre para ecrã inteiro e para diálogos: marcar `inert`
   * em tudo o que não esteja no caminho entre o palco e o `body`. Guarda-se a
   * lista do que se marcou e desfaz-se exactamente isso — nunca um varrimento
   * geral, que apagaria o `inert` que o próprio chat usa quando está desligado.
   */
  useEffect(() => {
    const palco = palcoRef.current;
    if (!dentro || !palco) return;

    const marcados: HTMLElement[] = [];
    for (let no: HTMLElement | null = palco; no && no !== document.body; no = no.parentElement) {
      for (const irmao of no.parentElement?.children ?? []) {
        if (irmao === no || !(irmao instanceof HTMLElement) || irmao.inert) continue;
        irmao.inert = true;
        marcados.push(irmao);
      }
    }

    return () => {
      for (const el of marcados) el.inert = false;
    };
  }, [dentro]);

  /*
   * Os controlos escondem-se sozinhos, como num leitor de vídeo — mas só onde
   * há rato.
   *
   * Num ecrã táctil não existe `hover` para os trazer de volta, e o vídeo é um
   * iframe de OUTRO domínio: um toque em cima dele nem sequer chega a esta
   * página, por isso não há evento nenhum com que os fazer reaparecer. Esconder
   * ali era esconder para sempre. Por isso a pergunta é feita ao ponteiro e não
   * ao tamanho do ecrã.
   *
   * O `focusin` é o que garante o caminho do teclado: quem chega ao interruptor
   * com o Tab traz os controlos de volta antes de os ver.
   */
  useEffect(() => {
    if (!dentro) {
      setControlosAVista(true);
      return;
    }
    const palco = palcoRef.current;
    if (!palco) return;

    const comRato = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const mostrar = () => {
      setControlosAVista(true);
      clearTimeout(temporizador);
      if (comRato) {
        temporizador = setTimeout(() => setControlosAVista(false), ESCONDER_CONTROLOS_MS);
      }
    };

    mostrar();
    palco.addEventListener("pointermove", mostrar);
    palco.addEventListener("pointerdown", mostrar);
    palco.addEventListener("focusin", mostrar);
    // No documento e não no palco: em ecrã inteiro o foco está quase sempre no
    // `body`, e um `keydown` no palco nunca chegava a disparar.
    document.addEventListener("keydown", mostrar);

    return () => {
      clearTimeout(temporizador);
      palco.removeEventListener("pointermove", mostrar);
      palco.removeEventListener("pointerdown", mostrar);
      palco.removeEventListener("focusin", mostrar);
      document.removeEventListener("keydown", mostrar);
    };
  }, [dentro]);

  /*
   * A tecla `c`, irmã do `f` do ecrã inteiro — e com a mesma guarda, que aqui é
   * ainda mais precisa de ser: o painel que esta tecla abre TEM uma caixa de
   * texto, e escrever "chavão" no chat não pode fechar o chat a meio da
   * palavra. Também se ignoram as combinações com modificador, senão o `Ctrl+C`
   * de copiar deixava de copiar.
   *
   * Só em ecrã inteiro: fora dele o chat é uma coluna que está sempre lá, e uma
   * tecla que não faz nada é pior do que tecla nenhuma.
   */
  useEffect(() => {
    if (!dentro) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const foco = document.activeElement as HTMLElement | null;
      if (foco) {
        const tag = foco.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || foco.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      alternarChat();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [dentro, alternarChat]);

  const chatAVista = !dentro || ligado;

  return (
    <div
      ref={palcoRef}
      style={MEDIDAS}
      className={cn(
        /*
         * `isolate` prende aqui dentro os `z-index` da moldura, da marca e do
         * chat. Sem ele, a marca (que sobe a `Z_MARCA` para ficar à frente do
         * chat) subia no contexto da PÁGINA e podia passar por cima do resto.
         * Em ecrã inteiro o browser já cria o contexto por si — isto é para o
         * outro 99% do tempo.
         */
        "isolate",
        dentro
          ? "relative size-full bg-black"
          : "grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_var(--chat-coluna)] lg:grid-rows-[auto_auto]",
      )}
    >
      {/*
       * O VÍDEO. Em ecrã inteiro ocupa o palco todo e o `preencher` tira à
       * moldura os 16:9 — é o player da Cloudflare que enquadra o vídeo lá
       * dentro, como sempre fez.
       *
       * ⚠️ Esta caixa não pode ganhar `transform`, `filter`, `opacity` nem
       * `isolate`: prendiam a marca de água aqui dentro e ela deixava de poder
       * ficar à frente do chat. Ver a nota do topo.
       */}
      <div className={dentro ? "absolute inset-0" : "min-w-0 lg:col-start-1 lg:row-start-1"}>
        <WatchPlayer
          eventId={eventId}
          watermark={watermark}
          mode="live"
          alvoEcraInteiro={palcoRef}
          preencher={dentro}
        />
      </div>

      {/*
       * O TÍTULO E O RESTO. Escondido em ecrã inteiro com `hidden` e não
       * desmontado: o `LikeShare` tem estado do cliente e desmontá-lo perdia o
       * gosto acabado de dar de cada vez que se entrasse em ecrã inteiro.
       */}
      <div className={dentro ? "hidden" : "min-w-0 lg:col-start-1 lg:row-start-2"}>{info}</div>

      {/*
       * A CONVERSA. O mesmo nó nos dois sítios.
       *
       * Ao lado do vídeo: a célula da grelha ocupa a linha do vídeo e serve de
       * referência; o painel enche-a por dentro (`absolute inset-0`), o que faz
       * com que ele tenha exactamente a altura do vídeo e role por dentro em vez
       * de esticar a página. Abaixo de `lg` a coluna passa para baixo do vídeo e
       * o painel volta a ser um bloco normal, com o tecto de `55dvh`.
       *
       * Por cima do vídeo: uma caixa encostada à direita, a começar por baixo da
       * fila de controlos.
       *
       * Desligado, fica `opacity-0` e `inert` — e não `hidden`. Com
       * `display:none` a lista deixava de ter altura, o "acompanhar o fundo"
       * escrevia `scrollTop = 0` a cada mensagem nova e, ao voltar a abrir, a
       * conversa aparecia no princípio da noite em vez de na última mensagem.
       * O `inert` é o que impede o painel invisível de ficar no caminho do Tab
       * e na árvore de acessibilidade.
       */}
      <div
        inert={!chatAVista}
        className={cn(
          "min-w-0",
          dentro
            ? "absolute right-3 bottom-3 top-(--topo-sobreposto) w-(--chat-sobreposto) transition-opacity duration-150"
            : "lg:relative lg:col-start-2 lg:row-start-1",
          dentro && !ligado && "pointer-events-none opacity-0",
        )}
        style={dentro ? { zIndex: Z_CHAT_SOBREPOSTO } : undefined}
      >
        <ChatPanel
          eventId={eventId}
          viewerId={viewerId}
          initial={inicial}
          variante={dentro ? "sobreposto" : "coluna"}
          onFechar={dentro ? alternarChat : undefined}
          className={dentro ? "size-full" : "lg:absolute lg:inset-0"}
        />
      </div>

      {/*
       * O INTERRUPTOR. Só em ecrã inteiro — fora dele a conversa está sempre lá
       * e não há nada para ligar.
       *
       * Escondido, continua focável de propósito (`opacity-0` não tira do Tab; o
       * `pointer-events-none` é que evita cliques às cegas). Quem chegar cá com
       * o teclado dispara o `focusin` do efeito acima, os controlos voltam, e só
       * então o botão volta a receber cliques. É esse o caminho alternativo ao
       * hover — mais o `c`, e mais o X que o painel mostra enquanto está aberto.
       */}
      {dentro ? (
        <button
          type="button"
          onClick={alternarChat}
          aria-pressed={ligado}
          aria-label="Chat sobre o vídeo"
          aria-keyshortcuts="c"
          title={ligado ? "Esconder o chat (c)" : "Mostrar o chat (c)"}
          style={{ zIndex: Z_CONTROLOS }}
          className={cn(
            // 44×44 de alvo, como o botão do leitor ao lado — o que tem de ter
            // 44px é a área que recebe o toque, não o desenho.
            "absolute top-3 right-(--recuo-2o-controlo) inline-flex size-11 cursor-pointer items-center justify-center rounded-sm",
            "bg-bar/55 text-bar-foreground transition-opacity transition-colors hover:bg-bar/85",
            "focus-visible:bg-bar/85",
            !controlosAVista && "pointer-events-none opacity-0",
          )}
        >
          {ligado ? <IconeChatLigado /> : <IconeChatDesligado />}
        </button>
      ) : null}
    </div>
  );
}

/*
 * Os dois ícones do interruptor: um balão de fala, e o mesmo balão riscado.
 * Traço de 2, `currentColor`, sem preenchimento — a mesma linguagem dos ícones
 * do leitor. O estado real vai no `aria-pressed`; o desenho é para os olhos.
 */
function IconeChatLigado() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3v4l4.5-4H20a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
    </svg>
  );
}

function IconeChatDesligado() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3v4l4.5-4H20a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
      <path d="M4 3.5 20 20.5" />
    </svg>
  );
}
