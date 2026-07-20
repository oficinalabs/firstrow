import type { ChannelRole } from "@/db/schema";

/*
 * ============================================================================
 *  O CONTRATO DA CONVERSA — o que o servidor e o browser têm de saber os dois
 * ============================================================================
 *
 * Isto está separado de `server/chat.ts` por uma razão que o build apanhou e
 * que vale a pena ficar escrita: `server/chat.ts` tem `import "server-only"` e
 * fala com a base de dados. Bastou o painel importar de lá UM valor — o limite
 * de caracteres — para o empacotador arrastar o driver do Postgres para dentro
 * do bundle do browser e partir a compilação.
 *
 * Importar só tipos não daria problema (os tipos desaparecem na compilação);
 * o que arrasta o módulo inteiro é importar um VALOR. Como as constantes têm
 * mesmo de ser as mesmas dos dois lados — um limite de 300 caracteres validado
 * no servidor e desenhado no `maxLength` do campo — o sítio certo para elas é
 * um módulo neutro, que nenhum dos lados tem vergonha de importar.
 *
 * REGRA: aqui dentro não entra nada que toque na base de dados, em `headers()`,
 * nem em segredos. Só números, tipos e funções puras.
 */

// ── Números com nome ────────────────────────────────────────────────────────

/** Tamanho máximo de uma mensagem. Curto de propósito: é chat, não é um post. */
export const CHAT_BODY_MAX_CHARS = 300;

/**
 * Ritmo do polling durante a live. 4s fica no meio do intervalo decidido (3–5s):
 * uma conversa a 4 segundos lê-se como conversa, e é metade da carga de 2s.
 */
export const CHAT_LIVE_POLL_MS = 4_000;

/** Quantas mensagens vêm no primeiro carregamento e em cada poll. */
export const CHAT_PAGE_SIZE = 50;

/** Quantos comentários antigos traz cada "carregar mais" no VOD. */
export const CHAT_OLDER_PAGE_SIZE = 25;

/**
 * Quanto tempo o VOD (e portanto a conversa) fica disponível depois do evento.
 * Decisão do dono: os comentários fecham quando o VOD expira.
 */
export const VOD_AVAILABILITY_DAYS = 30;

/** Duração de um silenciamento, em minutos. */
export const CHAT_TIMEOUT_MINUTES = 15;

/**
 * Mensagens por conta e por minuto.
 *
 * Contado por CONTA e não por IP: o balde por IP é o padrão das rotas de
 * dinheiro, mas aqui punia uma casa inteira a ver a mesma batalha em quatro
 * telemóveis atrás do mesmo NAT, e não travava quem trocasse de rede. A conta é
 * o que custa a arranjar (login obrigatório), por isso é a chave certa.
 */
export const CHAT_MESSAGES_PER_MINUTE = { max: 12, windowMs: 60_000 } as const;

// ── A fase ──────────────────────────────────────────────────────────────────

/**
 * Em que vida está a conversa deste evento.
 *
 *   live    — a transmissão está no ar; o painel segue o fluxo do transporte
 *   arquivo — o evento terminou e o VOD ainda não expirou; comentários, sem
 *             polling agressivo (carrega ao abrir + "mais")
 *   fechado — ainda não começou, ou o VOD já expirou: lê-se, não se escreve
 */
export type ChatPhase = "live" | "arquivo" | "fechado";

/**
 * O parâmetro é estrutural (e não `EventRow`) para esta função poder viver num
 * módulo que o browser também importa. Um `EventRow` encaixa aqui sem conversão.
 */
export function chatPhase(
  event: { status: string; startsAt: Date },
  now: Date = new Date(),
): ChatPhase {
  if (event.status === "live") return "live";
  if (event.status !== "ended") return "fechado";

  const expiraEm = new Date(event.startsAt);
  expiraEm.setDate(expiraEm.getDate() + VOD_AVAILABILITY_DAYS);
  return now < expiraEm ? "arquivo" : "fechado";
}

// ── O que viaja na resposta ─────────────────────────────────────────────────

/** O papel do autor NESTE canal. `null` é um espectador comum. */
export type ChatAuthorRole = ChannelRole | null;

export type ChatMessageView = {
  id: string;
  body: string;
  /** ISO — o cliente formata, o servidor não decide fuso. */
  createdAt: string;
  duringLive: boolean;
  authorId: string;
  authorName: string;
  /** Lido de `channel_members`, por canal. Nunca uma lista em código. */
  authorRole: ChatAuthorRole;
};

export type ChatSnapshot = {
  phase: ChatPhase;
  /** Pode escrever agora? (fase aberta e não silenciado.) */
  canWrite: boolean;
  /** Silenciado até quando, em ISO. `null` quando não está. */
  mutedUntil: string | null;
  moderator: boolean;
  messages: ChatMessageView[];
  /**
   * Mensagens apagadas por moderação desde o último poll.
   *
   * Existe porque o polling só traz o que é NOVO: sem esta lista, uma mensagem
   * apagada continuava no ecrã de toda a gente que já a tinha recebido, e só
   * desaparecia para quem entrasse depois. A moderação tem de se ver em direto,
   * senão não é moderação.
   */
  deletedIds: string[];
  /** Cursor a devolver no próximo poll. `null` quando ainda não há mensagens. */
  cursor: string | null;
  /** Relógio do servidor: volta no próximo poll como `since` dos apagados. */
  since: string;
  /** Há mensagens mais antigas por carregar (o "mais" do VOD). */
  hasOlder: boolean;
};

export type LikeState = {
  /** Contagem PÚBLICA — anónimo também a vê. */
  count: number;
  /** Gostei? `false` para quem não tem sessão. */
  liked: boolean;
};

// ── Funções puras ───────────────────────────────────────────────────────────

/**
 * Normaliza o corpo de uma mensagem. Devolve `null` quando não sobra mensagem.
 *
 * NÃO filtra linguagem, e é decisão de produto: isto é battle rap, os palavrões
 * são o género. A moderação é humana e é da liga.
 */
export function normalizeBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Colapsa linhas em branco a mais e apara as pontas: uma "mensagem" de 40
  // newlines não é uma mensagem, é um empurrão ao resto da conversa para fora
  // do ecrã.
  const limpo = raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!limpo) return null;
  return limpo.slice(0, CHAT_BODY_MAX_CHARS);
}
