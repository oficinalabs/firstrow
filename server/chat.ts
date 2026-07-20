import "server-only";
import { and, asc, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/auth-schema";
import {
  type ChannelRole,
  channelMembers,
  chatMessages,
  chatTimeouts,
  eventLikes,
} from "@/db/schema";
import {
  CHAT_OLDER_PAGE_SIZE,
  CHAT_PAGE_SIZE,
  CHAT_TIMEOUT_MINUTES,
  type ChatAuthorRole,
  type ChatMessageView,
  type ChatPhase,
  type ChatSnapshot,
  chatPhase,
  type LikeState,
} from "@/lib/chat";
import { newId } from "@/lib/ids";
import { type AuthUser, canOperateEvents, getCurrentUser, loadMemberships } from "@/server/authz";
import { canWatchEvent, type EventRow } from "@/server/event-access";
import { getEvent } from "@/server/events";

/*
 * ============================================================================
 *  A CONVERSA DO EVENTO — chat ao vivo e comentários do VOD, uma peça só
 * ============================================================================
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  1. QUEM PODE — e porque é que essa pergunta só se responde num sítio
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ler e escrever na conversa de um evento é EXATAMENTE ter acesso ao evento:
 * `canWatchEvent`, a mesma função que o player usa para decidir se assina um
 * token. Não há aqui uma segunda regra, nem uma versão "parecida" para o chat.
 *
 * Isto não é purismo. Esta plataforma já teve dois sítios a decidir a mesma
 * coisa e a dar respostas diferentes — e o bug que daí saiu não se via a ler o
 * código, só a medir. Uma regra que existe duas vezes diverge; a única defesa
 * é não a escrever duas vezes.
 *
 * Consequência de produto, decidida pelo dono: **quem não comprou não vê o
 * chat.** Faz parte do que se paga.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  2. O TRANSPORTE — e onde se troca sem reescrever a UI
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O transporte é POLLING CURTO contra o Postgres. Porquê, escrito para quem
 * vier a seguir e achar que devia ser WebSockets:
 *
 *   · a app corre em serverless na Vercel, onde não há WebSockets nativos;
 *   · a escala da Fase 0 é 50–150 espectadores por evento;
 *   · um poll de 4s com 150 pessoas são ~37 leituras/s, indexadas e pequenas —
 *     o Neon aguenta sem infraestrutura nova, sem custo novo, sem dependência
 *     nova.
 *
 * ⚠️ **O PONTO DE TROCA É `components/chat/chat-transport.ts`** — a interface
 * `ChatTransport`. A UI (`components/chat/chat-panel.tsx`) não sabe se as
 * mensagens chegam por polling, por SSE ou por um Pusher/Ably: só chama
 * `subscribe()`, `send()`, `older()`. Trocar de transporte é escrever uma
 * segunda implementação dessa interface e passá-la ao painel. Este ficheiro —
 * o servidor — não muda nada nessa troca: `chatSnapshot()` continua a ser a
 * leitura, venha o pedido de onde vier.
 *
 * O sinal para trocar: um evento acima de ~500 espectadores em simultâneo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  3. O CURSOR É UM PAR, E ISSO É PROPOSITADO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O polling pede "o que há de novo desde X". Com `X = created_at` apenas, duas
 * mensagens gravadas no mesmo milissegundo — numa batalha com 150 pessoas, isso
 * acontece — davam um de dois erros, conforme o operador: `>` perdia uma
 * mensagem para sempre, `>=` repetia a última em cada poll. O cursor é o par
 * `(created_at, id)` e a comparação é lexicográfica, o que não tem nem um nem
 * outro problema.
 *
 * E O RELÓGIO É SEMPRE O DO POSTGRES. Nunca `new Date()` do Node: as instâncias
 * serverless têm relógios ligeiramente diferentes entre si, e um cursor gerado
 * numa instância adiantada saltava mensagens escritas por outra atrasada.
 */

export type {
  ChatAuthorRole,
  ChatMessageView,
  ChatPhase,
  ChatSnapshot,
  LikeState,
} from "@/lib/chat";
/*
 * As constantes, os tipos que viajam na resposta e as funções puras vivem em
 * `lib/chat.ts` — um módulo neutro que o browser também pode importar. Este
 * ficheiro tem `server-only` e o driver do Postgres atrás dele; bastava o painel
 * importar daqui UM valor para o bundle do cliente levar a base de dados atrás.
 * Reexportam-se para quem já está no servidor não ter de saber isso.
 */
export {
  CHAT_BODY_MAX_CHARS,
  CHAT_LIVE_POLL_MS,
  CHAT_MESSAGES_PER_MINUTE,
  CHAT_OLDER_PAGE_SIZE,
  CHAT_PAGE_SIZE,
  CHAT_TIMEOUT_MINUTES,
  chatPhase,
  normalizeBody,
  VOD_AVAILABILITY_DAYS,
} from "@/lib/chat";

// ── O portão ────────────────────────────────────────────────────────────────

/** Quem é, o que é o evento, e o que pode fazer aqui dentro. */
export type ChatAccess =
  | { ok: false; reason: "anonymous" | "denied" }
  | {
      ok: true;
      user: AuthUser;
      event: EventRow;
      phase: ChatPhase;
      /** Opera o canal DESTE evento: pode apagar e silenciar. */
      moderator: boolean;
    };

/**
 * O portão da conversa, e o único. Todas as rotas de `/api/chat` passam por
 * aqui — nenhuma repete a decisão, nenhuma a aproxima.
 *
 * "Não existe" e "não é teu" saem os dois como `denied`, pela mesma razão que
 * em `server/event-access.ts`: quem chama não os consegue distinguir, logo não
 * os consegue revelar.
 */
export async function openChat(eventId: string): Promise<ChatAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "anonymous" };
  return openChatFor(user, eventId);
}

/**
 * O mesmo portão, para um utilizador já resolvido.
 *
 * Existe separado por uma razão prática: `openChat` lê a sessão dos cabeçalhos
 * do pedido, e um teste não tem cabeçalhos. Se os testes montassem o `access`
 * à mão, estariam a provar uma cópia da regra em vez da regra — que é o erro
 * exato de que este ficheiro inteiro se defende. Assim os testes chamam ESTA
 * função, que é a que decide, e `openChat` fica a ser só "quem és + isto".
 */
export async function openChatFor(user: AuthUser, eventId: string): Promise<ChatAccess> {
  const event = await getEvent(eventId);
  if (!event) return { ok: false, reason: "denied" };

  // A MESMA regra do player. Ver o cabeçalho.
  if (!(await canWatchEvent(user, event))) return { ok: false, reason: "denied" };

  return {
    ok: true,
    user,
    event,
    phase: chatPhase(event),
    // Papel lido das filiações reais e SEMPRE contra o canal deste evento:
    // quem opera a liga A não modera a conversa da liga B.
    moderator: canOperateEvents(user, event.channelId),
  };
}

// ── Cursor ──────────────────────────────────────────────────────────────────

export type ChatCursor = { createdAt: Date; id: string };

/** `<iso>|<id>` — opaco para o cliente, que só o devolve como o recebeu. */
export function encodeCursor(cursor: ChatCursor): string {
  return `${cursor.createdAt.toISOString()}|${cursor.id}`;
}

/** Um cursor ilegível é tratado como "não tenho cursor", nunca como erro. */
export function decodeCursor(raw: string | null | undefined): ChatCursor | null {
  if (!raw) return null;
  const corte = raw.indexOf("|");
  if (corte <= 0) return null;

  const createdAt = new Date(raw.slice(0, corte));
  const id = raw.slice(corte + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;

  return { createdAt, id };
}

// ── Leitura ─────────────────────────────────────────────────────────────────

/**
 * As colunas que viajam para o browser. Escritas uma vez, aqui, para que
 * acrescentar uma coluna à tabela nunca a publique por acidente — o `body` de
 * uma mensagem apagada, por exemplo, nunca sai daqui.
 */
function messageColumns(channelId: string) {
  return (
    db
      .select({
        id: chatMessages.id,
        body: chatMessages.body,
        createdAt: chatMessages.createdAt,
        duringLive: chatMessages.duringLive,
        authorId: chatMessages.userId,
        authorName: userTable.name,
        authorRole: channelMembers.role,
      })
      .from(chatMessages)
      .innerJoin(userTable, eq(userTable.id, chatMessages.userId))
      /*
       * O distintivo de dono/staff. O `and` com o canal do evento é o que impede
       * o staff da liga A de aparecer distinguido na conversa da liga B: sem ele,
       * bastava ter papel em QUALQUER canal para o ecrã lhe dar autoridade que
       * ali não tem.
       */
      .leftJoin(
        channelMembers,
        and(
          eq(channelMembers.userId, chatMessages.userId),
          eq(channelMembers.channelId, channelId),
        ),
      )
  );
}

function toView(row: {
  id: string;
  body: string;
  createdAt: Date;
  duringLive: boolean;
  authorId: string;
  authorName: string;
  authorRole: ChannelRole | null;
}): ChatMessageView {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    duringLive: row.duringLive,
    authorId: row.authorId,
    authorName: row.authorName,
    authorRole: row.authorRole,
  };
}

/** A hora segundo o Postgres — o único relógio desta conversa. */
async function serverNow(): Promise<Date> {
  const linhas = await db.execute<{ agora: Date }>(sql`select now() as agora`);
  const valor = (linhas[0] as unknown as { agora: Date | string } | undefined)?.agora;
  return valor ? new Date(valor) : new Date();
}

/**
 * A leitura da conversa. É o que a rota de polling devolve e o que a página
 * renderiza no servidor — a mesma função, para que o primeiro ecrã e o primeiro
 * poll nunca discordem.
 *
 * Sem `cursor` (primeira leitura) traz as últimas `CHAT_PAGE_SIZE` mensagens.
 * Com `cursor`, só o que veio depois dele.
 */
export async function chatSnapshot(
  access: Extract<ChatAccess, { ok: true }>,
  opcoes: { cursor?: string | null; since?: string | null } = {},
): Promise<ChatSnapshot> {
  const { event, user } = access;
  const cursor = decodeCursor(opcoes.cursor);
  const agora = await serverNow();

  const [linhas, mutedUntil, apagadas] = await Promise.all([
    cursor ? messagesAfter(event, cursor) : latestMessages(event),
    mutedUntilFor(event.id, user.id),
    listDeletedSince(event.id, opcoes.since),
  ]);

  // `latestMessages` lê ao contrário (as últimas) — o ecrã quer ordem natural.
  const messages = cursor ? linhas.map(toView) : linhas.map(toView).reverse();
  const ultima = messages.at(-1);

  const silenciado = mutedUntil != null && mutedUntil > agora;

  return {
    phase: access.phase,
    canWrite: access.phase !== "fechado" && !silenciado,
    mutedUntil: silenciado ? mutedUntil.toISOString() : null,
    moderator: access.moderator,
    messages,
    deletedIds: apagadas,
    cursor: ultima
      ? encodeCursor({ createdAt: new Date(ultima.createdAt), id: ultima.id })
      : (opcoes.cursor ?? null),
    since: agora.toISOString(),
    // Só faz sentido perguntar no primeiro carregamento; num poll não há
    // "mais antigas" novas para descobrir.
    hasOlder: cursor ? false : linhas.length === CHAT_PAGE_SIZE,
  };
}

/** As últimas N mensagens vivas — ordem descendente, invertida por quem chama. */
function latestMessages(event: EventRow) {
  return messageColumns(event.channelId)
    .where(and(eq(chatMessages.eventId, event.id), isNull(chatMessages.deletedAt)))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(CHAT_PAGE_SIZE);
}

/**
 * O que apareceu depois do cursor.
 *
 * A condição é a comparação lexicográfica do par `(created_at, id)`, escrita à
 * mão porque o drizzle não tem construtor para comparação de tuplos: ou o
 * carimbo é maior, ou é igual e o id desempata. Ver o cabeçalho para o porquê
 * de não bastar o carimbo.
 */
function messagesAfter(event: EventRow, cursor: ChatCursor) {
  return messageColumns(event.channelId)
    .where(
      and(
        eq(chatMessages.eventId, event.id),
        isNull(chatMessages.deletedAt),
        or(
          gt(chatMessages.createdAt, cursor.createdAt),
          and(eq(chatMessages.createdAt, cursor.createdAt), gt(chatMessages.id, cursor.id)),
        ),
      ),
    )
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
    .limit(CHAT_PAGE_SIZE);
}

/** O "carregar mais" do arquivo: o que está ANTES da mensagem mais antiga vista. */
export async function olderMessages(
  access: Extract<ChatAccess, { ok: true }>,
  before: string | null,
): Promise<{ messages: ChatMessageView[]; hasOlder: boolean }> {
  const cursor = decodeCursor(before);
  if (!cursor) return { messages: [], hasOlder: false };

  const linhas = await messageColumns(access.event.channelId)
    .where(
      and(
        eq(chatMessages.eventId, access.event.id),
        isNull(chatMessages.deletedAt),
        or(
          lt(chatMessages.createdAt, cursor.createdAt),
          and(eq(chatMessages.createdAt, cursor.createdAt), lt(chatMessages.id, cursor.id)),
        ),
      ),
    )
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(CHAT_OLDER_PAGE_SIZE);

  return {
    messages: linhas.map(toView).reverse(),
    hasOlder: linhas.length === CHAT_OLDER_PAGE_SIZE,
  };
}

/** Ids apagados por moderação desde `since`. Ver a nota em `ChatSnapshot`. */
async function listDeletedSince(
  eventId: string,
  since: string | null | undefined,
): Promise<string[]> {
  if (!since) return [];
  const desde = new Date(since);
  if (Number.isNaN(desde.getTime())) return [];

  const linhas = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.eventId, eventId), gt(chatMessages.deletedAt, desde)))
    .limit(CHAT_PAGE_SIZE);

  return linhas.map((linha) => linha.id);
}

// ── Escrita ─────────────────────────────────────────────────────────────────

export type ChatPost =
  | { ok: true; message: ChatMessageView }
  | { ok: false; error: string; status: number };

/**
 * Escreve uma mensagem.
 *
 * A fase e o silenciamento são reconfirmados AQUI, no servidor, e não apenas no
 * `canWrite` que foi para o ecrã: o `canWrite` pinta o formulário, não autoriza
 * nada. Quem falar com a API à mão não passa pelo formulário.
 */
export async function postMessage(
  access: Extract<ChatAccess, { ok: true }>,
  corpo: string,
): Promise<ChatPost> {
  if (access.phase === "fechado") {
    return { ok: false, error: "A conversa deste evento está fechada.", status: 409 };
  }

  const silenciadoAte = await mutedUntilFor(access.event.id, access.user.id);
  if (silenciadoAte && silenciadoAte > (await serverNow())) {
    return { ok: false, error: "Estás silenciado neste evento.", status: 403 };
  }

  const [linha] = await db
    .insert(chatMessages)
    .values({
      id: newId(),
      eventId: access.event.id,
      userId: access.user.id,
      body: corpo,
      // Ver a nota da coluna: guardado agora porque depois já não é dedutível.
      duringLive: access.phase === "live",
    })
    .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });

  if (!linha) return { ok: false, error: "Não foi possível enviar.", status: 500 };

  return {
    ok: true,
    message: {
      id: linha.id,
      body: corpo,
      createdAt: linha.createdAt.toISOString(),
      duringLive: access.phase === "live",
      authorId: access.user.id,
      authorName: access.user.name,
      // O papel do próprio autor, contra o canal DESTE evento.
      authorRole: roleInChannel(access.user, access.event.channelId),
    },
  };
}

function roleInChannel(user: AuthUser, channelId: string): ChatAuthorRole {
  return user.memberships.find((m) => m.channelId === channelId)?.role ?? null;
}

// ── Moderação ───────────────────────────────────────────────────────────────

export type ModerationResult = { ok: true } | { ok: false; error: string; status: number };

const NOT_A_MODERATOR = "Não tens permissão para moderar esta conversa.";

/**
 * Apagar uma mensagem (soft-delete).
 *
 * ⚠️ O `where` filtra por `event_id` ALÉM do id da mensagem, e isso é o que
 * impede a fuga entre canais: sem ele, um dono da liga A que descobrisse o id
 * de uma mensagem da liga B apagava-a — o gate de `openChat` só lhe verificou o
 * poder sobre o evento que ele DISSE estar a moderar. A mensagem tem de
 * pertencer a esse evento.
 */
export async function deleteMessage(
  access: Extract<ChatAccess, { ok: true }>,
  messageId: string,
): Promise<ModerationResult> {
  if (!access.moderator) return { ok: false, error: NOT_A_MODERATOR, status: 403 };

  const apagadas = await db
    .update(chatMessages)
    .set({ deletedAt: sql`now()`, deletedBy: access.user.id })
    .where(
      and(
        eq(chatMessages.id, messageId),
        eq(chatMessages.eventId, access.event.id),
        isNull(chatMessages.deletedAt),
      ),
    )
    .returning({ id: chatMessages.id });

  // Mensagem inexistente, de outro evento, ou já apagada: a mesma resposta.
  // Distinguir contava a quem procura que a mensagem existe algures.
  if (apagadas.length === 0) {
    return { ok: false, error: "Essa mensagem já não está aqui.", status: 404 };
  }
  return { ok: true };
}

/**
 * Silenciar uma conta neste evento.
 *
 * Não deixa silenciar quem também opera o canal — nem a si próprio. Um staff a
 * silenciar o dono da liga a meio de uma batalha é um problema que se resolve
 * melhor aqui do que a discutir depois.
 */
export async function muteUser(
  access: Extract<ChatAccess, { ok: true }>,
  targetUserId: string,
  minutos: number = CHAT_TIMEOUT_MINUTES,
): Promise<ModerationResult> {
  if (!access.moderator) return { ok: false, error: NOT_A_MODERATOR, status: 403 };
  if (targetUserId === access.user.id) {
    return { ok: false, error: "Não te podes silenciar a ti próprio.", status: 400 };
  }

  // O papel do alvo, lido da mesma fonte de sempre (`channel_members`), contra
  // o canal deste evento.
  const memberships = await loadMemberships(targetUserId);
  if (canOperateEvents({ role: "viewer", memberships }, access.event.channelId)) {
    return { ok: false, error: "Não podes silenciar quem opera o canal.", status: 403 };
  }

  const until = new Date(Date.now() + minutos * 60_000);

  await db
    .insert(chatTimeouts)
    .values({
      id: newId(),
      eventId: access.event.id,
      userId: targetUserId,
      until,
      createdBy: access.user.id,
    })
    .onConflictDoUpdate({
      target: [chatTimeouts.eventId, chatTimeouts.userId],
      set: { until, createdBy: access.user.id },
    });

  return { ok: true };
}

/** Até quando esta conta está silenciada neste evento. `null` = não está. */
async function mutedUntilFor(eventId: string, userId: string): Promise<Date | null> {
  const [linha] = await db
    .select({ until: chatTimeouts.until })
    .from(chatTimeouts)
    .where(and(eq(chatTimeouts.eventId, eventId), eq(chatTimeouts.userId, userId)))
    .limit(1);
  return linha?.until ?? null;
}

// ── Gosto ───────────────────────────────────────────────────────────────────

/**
 * O estado do gosto.
 *
 * Devolve um número e um booleano — nunca a lista de quem gostou. Decisão do
 * dono: a contagem é pública, a identidade é privada. Não há aqui nenhuma
 * função que devolva os nomes, e não deve passar a haver sem essa decisão mudar.
 */
export async function getLikes(eventId: string, userId: string | null): Promise<LikeState> {
  const [contagem, meu] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(eventLikes)
      .where(eq(eventLikes.eventId, eventId)),
    userId
      ? db
          .select({ id: eventLikes.id })
          .from(eventLikes)
          .where(and(eq(eventLikes.eventId, eventId), eq(eventLikes.userId, userId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return { count: contagem[0]?.n ?? 0, liked: meu.length > 0 };
}

/**
 * Alterna o gosto desta conta neste evento.
 *
 * Tenta apagar primeiro; se não havia nada para apagar, insere. Dois cliques em
 * simultâneo não conseguem criar dois gostos — o índice único recusa o segundo,
 * e o `onConflictDoNothing` transforma essa recusa em "já estava", que é a
 * verdade.
 */
export async function toggleLike(eventId: string, userId: string): Promise<LikeState> {
  const removidas = await db
    .delete(eventLikes)
    .where(and(eq(eventLikes.eventId, eventId), eq(eventLikes.userId, userId)))
    .returning({ id: eventLikes.id });

  if (removidas.length === 0) {
    await db
      .insert(eventLikes)
      .values({ id: newId(), eventId, userId })
      .onConflictDoNothing({ target: [eventLikes.eventId, eventLikes.userId] });
  }

  return getLikes(eventId, userId);
}
