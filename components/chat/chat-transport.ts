import { CHAT_LIVE_POLL_MS, type ChatMessageView, type ChatSnapshot } from "@/lib/chat";

/*
 * ============================================================================
 *  ⚠️ O PONTO DE TROCA DO TRANSPORTE DA CONVERSA
 * ============================================================================
 *
 * Este ficheiro é a fronteira. Acima dele, `chat-panel.tsx` só sabe que as
 * mensagens "chegam"; abaixo dele, `httpPollingTransport` sabe que chegam por
 * polling HTTP contra o Postgres.
 *
 * TROCAR PARA SSE, PUSHER OU ABLY É ESCREVER UMA SEGUNDA IMPLEMENTAÇÃO DE
 * `ChatTransport` E PASSÁ-LA AO PAINEL. Nada mais. O painel não muda, os
 * componentes de mensagem não mudam, e o servidor (`server/chat.ts`) também
 * não — a leitura continua a ser a mesma função.
 *
 * A única operação que é mesmo "de transporte" é `follow()`: em polling é um
 * `setTimeout` a repetir; em SSE seria um `EventSource`; num serviço externo
 * seria a subscrição do canal deles. As outras (`send`, `older`, `remove`,
 * `mute`) são pedidos pontuais e continuariam a ser HTTP em qualquer um dos
 * cenários.
 *
 * PORQUÊ POLLING, HOJE (decisão tomada, não um adiamento): a app corre em
 * serverless na Vercel, onde não há WebSockets nativos; a escala da Fase 0 são
 * 50–150 espectadores; a 4 segundos isso são ~37 leituras/s, indexadas, que o
 * Neon serve sem infraestrutura nem custo novos.
 *
 * O SINAL PARA TROCAR: um evento acima de ~500 espectadores em simultâneo, ou
 * uma conta do Neon a queixar-se de leituras. Aí escreve-se o `sseTransport` ao
 * lado deste e troca-se o argumento.
 */

export type ChatOlderPage = { messages: ChatMessageView[]; hasOlder: boolean };

export type ChatFeedHandlers = {
  onSnapshot(snapshot: ChatSnapshot): void;
  /** Falha de rede. O painel decide se a mostra — não é para alarmar por um poll. */
  onError(message: string): void;
};

/**
 * O contrato. Quem o implementa decide COMO as mensagens chegam; quem o consome
 * nunca precisa de saber.
 */
export type ChatTransport = {
  /** Primeira leitura: o que já lá está, e o estado da conversa. */
  open(): Promise<ChatSnapshot>;
  /** As anteriores a um cursor — o "carregar mais" do arquivo. */
  older(before: string): Promise<ChatOlderPage>;
  send(body: string): Promise<ChatMessageView>;
  remove(messageId: string): Promise<void>;
  mute(userId: string): Promise<void>;
  /** Liga o fluxo contínuo; devolve a função que o desliga. */
  follow(handlers: ChatFeedHandlers): () => void;
};

// ── Números com nome ────────────────────────────────────────────────────────

/**
 * Recuo depois de uma falha: o intervalo duplica até este teto e volta ao
 * normal ao primeiro sucesso. Sem isto, um servidor em apuros levava com o
 * mesmo caudal de pedidos de toda a audiência enquanto durasse o problema.
 */
const INTERVALO_MAXIMO_MS = 30_000;

/** Só a partir daqui é que uma falha de rede chega ao ecrã. */
const FALHAS_ATE_AVISAR = 3;

const ERRO_GENERICO = "Não foi possível falar com o servidor.";

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, { ...init, cache: "no-store" });

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { error?: string } | null;
    throw new Error(corpo?.error ?? ERRO_GENERICO);
  }

  return (await resposta.json()) as T;
}

/**
 * O transporte de hoje: polling curto contra o Postgres.
 *
 * Guarda o cursor por dentro. É de propósito: um transporte por SSE não tem
 * cursor nenhum, e se o painel andasse a passá-lo de um lado para o outro a
 * troca deixava de ser só este ficheiro.
 */
export function httpPollingTransport(
  eventId: string,
  opcoes: { intervalMs?: number } = {},
): ChatTransport {
  const base = `/api/chat/${encodeURIComponent(eventId)}`;
  const intervaloBase = opcoes.intervalMs ?? CHAT_LIVE_POLL_MS;

  // O estado do fluxo. Só este ficheiro lhe toca.
  let cursor: string | null = null;
  let desde: string | null = null;

  function guardarPosicao(snapshot: ChatSnapshot): void {
    cursor = snapshot.cursor;
    desde = snapshot.since;
  }

  async function ler(): Promise<ChatSnapshot> {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    if (desde) query.set("desde", desde);

    const snapshot = await pedir<ChatSnapshot>(
      query.size > 0 ? `${base}?${query.toString()}` : base,
    );
    guardarPosicao(snapshot);
    return snapshot;
  }

  return {
    open: ler,

    older: (before) => pedir<ChatOlderPage>(`${base}?antes=${encodeURIComponent(before)}`),

    async send(body) {
      const { message } = await pedir<{ message: ChatMessageView }>(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      return message;
    },

    remove: (messageId) =>
      pedir<{ ok: true }>(`${base}/mensagens/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
      }).then(() => undefined),

    mute: (userId) =>
      pedir<{ ok: true }>(`${base}/silenciar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }).then(() => undefined),

    /*
     * O laço. Um `setTimeout` encadeado, e não um `setInterval`: com intervalos
     * fixos, um pedido lento fazia os seguintes empilharem-se uns em cima dos
     * outros. Assim o relógio só volta a andar depois da resposta chegar.
     *
     * Com o separador escondido não se lê nada — 150 pessoas com a batalha numa
     * aba de fundo não têm de custar leituras nenhumas.
     */
    follow({ onSnapshot, onError }) {
      let vivo = true;
      let temporizador: ReturnType<typeof setTimeout> | null = null;
      let falhas = 0;

      const escondido = () =>
        typeof document !== "undefined" && document.visibilityState === "hidden";

      function agendar(ms: number): void {
        if (!vivo) return;
        temporizador = setTimeout(passo, ms);
      }

      async function passo(): Promise<void> {
        if (!vivo) return;

        if (escondido()) {
          agendar(intervaloBase);
          return;
        }

        try {
          const snapshot = await ler();
          if (!vivo) return;
          falhas = 0;
          onSnapshot(snapshot);
          agendar(intervaloBase);
        } catch (erro) {
          if (!vivo) return;
          falhas += 1;
          // Uma falha isolada é ruído de rede; três seguidas já é o servidor.
          if (falhas >= FALHAS_ATE_AVISAR) {
            onError(erro instanceof Error ? erro.message : ERRO_GENERICO);
          }
          agendar(Math.min(intervaloBase * 2 ** falhas, INTERVALO_MAXIMO_MS));
        }
      }

      // Voltar ao separador tem de trazer a conversa a horas, não daqui a 4s.
      const aoVoltar = () => {
        if (!escondido() && temporizador) {
          clearTimeout(temporizador);
          agendar(0);
        }
      };
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", aoVoltar);
      }

      agendar(intervaloBase);

      return () => {
        vivo = false;
        if (temporizador) clearTimeout(temporizador);
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", aoVoltar);
        }
      };
    },
  };
}
