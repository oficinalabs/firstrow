import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { channels, entitlements, events, playbackSessions, tickets } from "@/db/schema";
import {
  type DeliveryEstimate,
  type EconomicsTotals,
  type EventEconomics,
  eventEconomics,
  MAX_SESSION_MINUTES,
  resolveUsdToEur,
  totalEconomics,
} from "@/lib/video-costs";
import type { ChannelScope } from "@/server/authz";
import { inChannelScope } from "@/server/events";

/*
 * Queries agregadas do backoffice. Dinheiro sempre em cêntimos — formatar só
 * na UI via lib/format.ts. Timestamps guardados como hora UTC; fronteiras de
 * mês/dia calculadas em Europe/Lisbon.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  TODA A FUNÇÃO QUE SOMA MAIS DO QUE UM EVENTO RECEBE UM `ChannelScope`
 * ────────────────────────────────────────────────────────────────────────────
 *
 * E não é burocracia: antes do multi-canal, TODAS estas queries corriam sobre a
 * tabela de eventos inteira, sem filtro nenhum. Com um canal só, ninguém
 * notava. Ao entrar a segunda liga, o dono da primeira abria o backoffice e
 * via, sem fazer nada de especial:
 *
 *   · a receita e as compras do mês da outra liga (getDashboardStats)
 *   · os últimos pagamentos, com nome do comprador (listRecentPayments)
 *   · a lista de eventos da outra liga, com receita (listEventsWithSales)
 *   · NOME e EMAIL de todos os compradores dela (listBuyers)
 *   · o extrato mês a mês, ao cêntimo (getMonthlyStatement)
 *
 * O âmbito vem de `server/authz.ts` (`manageScope` / `operateScope`) e é
 * traduzido para SQL por `inChannelScope` — que devolve `false` para quem não
 * tem canais, porque "sem canais" tem de significar zero linhas e nunca
 * "sem filtro".
 *
 * As funções de UM evento (`getEventSales`, `countActiveViewers`,
 * `listBlockedSessionsToday`) não levam âmbito: quem as chama já passou pelo
 * portão do evento em `server/event-access.ts`, que é onde o canal foi visto.
 *
 * O extrato de ganhos (`getMonthlyStatement`) já conta bilhetes — PPV e
 * bilhetes em parcelas separadas, com o total somado. Falta o mesmo em três
 * sítios, e enquanto faltar cada um deles conta só PPV:
 *
 * TODO(frente-d): juntar bilhetes à receita do mês (`getDashboardStats`), aos
 * pagamentos recentes (`listRecentPayments`) e à lista de eventos
 * (`listEventsWithSales`).
 */

const LISBON = "Europe/Lisbon";

export type EventRow = typeof events.$inferSelect;

export type DashboardStats = {
  monthLabel: string;
  monthRevenueCents: number;
  monthPurchases: number;
  buyersTotal: number;
  nextEvent: EventRow | null;
  hasEvents: boolean;
};

export type RecentPayment = {
  id: string;
  createdAt: Date;
  buyerName: string;
  /**
   * O evento a que este pagamento pertence — para o título poder ser LINK.
   *
   * Sem isto, "Últimos pagamentos" mostrava o nome do evento como texto morto:
   * a linha diz que alguém pagou e não havia como ir ver o quê. O destino é o
   * hub do evento (`eventHubPath`), o mesmo a que já apontam o título na lista
   * e o cartão da próxima live — um só destino, decidido num só sítio.
   */
  eventId: string;
  eventTitle: string;
  /** De que canal entrou este dinheiro — o dashboard nomeia-o quando há vários. */
  channelId: string;
  amountCents: number;
  /** Só PPV na Fase 0; bilhetes físicos chegam com a Frente D. */
  kind: "ppv";
};

export type EventWithSales = EventRow & { buyers: number; revenueCents: number };

export type BuyerRow = {
  userId: string;
  name: string;
  email: string;
  purchases: number;
  lastPurchaseAt: Date;
  totalCents: number;
};

export type BlockedSession = { id: string; email: string; revokedAt: Date };

export type MonthlyStatementRow = {
  monthKey: string;
  monthLabel: string;
  /** De que canal é este dinheiro. Ver a nota em `getMonthlyStatement`. */
  channelId: string;
  /*
   * ────────────────────────────────────────────────────────────────────────
   *  AS DUAS ORIGENS SAEM SEPARADAS, E O TOTAL SAI SOMADO
   * ────────────────────────────────────────────────────────────────────────
   *
   * `grossCents` é o que a liga faturou no mês: acessos PPV **mais** bilhetes
   * de porta. É a soma que interessa a quem tem de ser pago — um extrato que
   * mostrasse só metade do dinheiro não serve para pagar nada.
   *
   * Mas as parcelas ficam à vista, porque são perguntas diferentes: "vendi
   * mais online ou à porta?" não se responde com o total. E é a existência
   * destas parcelas que mantém a identidade com a dashboard verificável ao
   * cêntimo, parcela a parcela — ver a nota em `getRevenueByPeriod`.
   *
   * ⚠️ O PREÇO VEM DE FONTES DIFERENTES DE PROPÓSITO: o PPV lê-se de
   * `events.price_cents` (preço único do evento) e o bilhete de
   * `tickets.price_cents`, que é uma CÓPIA por bilhete, feita na compra.
   * Não se unificam: o preço do evento pode mudar depois de um bilhete estar
   * vendido, e o extrato tem de continuar a dizer o que essa pessoa pagou.
   */
  ppvGrossCents: number;
  ppvPurchases: number;
  ticketGrossCents: number;
  ticketsSold: number;
  /** PPV + bilhetes. */
  grossCents: number;
  /** Transações do mês, das duas origens. */
  purchases: number;
  firstrowFeeCents: number;
  eupagoFeeCents: number;
  netCents: number;
};

export type PlatformTotals = { users: number; events: number; revenueCents: number };

function lisbonParts(instant: Date): { year: number; month: number; day: number } {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(instant)
    .split("-")
    .map(Number);
  return { year, month, day };
}

// Instante UTC da meia-noite de Lisboa em (ano, mês 1–12, dia): parte da
// meia-noite UTC e corrige pelo desvio observado (Lisboa é UTC+0/+1).
function lisbonMidnightUtc(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const hourAtGuess = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: LISBON,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(guess),
  );
  if (hourAtGuess === 0) return guess;
  const shiftHours = hourAtGuess > 12 ? 24 - hourAtGuess : -hourAtGuess;
  return new Date(guess.getTime() + shiftHours * 3_600_000);
}

function monthBounds(now = new Date()): { start: Date; end: Date; key: string } {
  const { year, month } = lisbonParts(now);
  const start = lisbonMidnightUtc(year, month, 1);
  const end =
    month === 12 ? lisbonMidnightUtc(year + 1, 1, 1) : lisbonMidnightUtc(year, month + 1, 1);
  return { start, end, key: `${year}-${String(month).padStart(2, "0")}` };
}

function lisbonDayStartUtc(now = new Date()): Date {
  const { year, month, day } = lisbonParts(now);
  return lisbonMidnightUtc(year, month, day);
}

/** "2026-07" → "julho 2026" (rótulo de período; datas pontuais: lib/format.ts). */
export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const name = new Intl.DateTimeFormat("pt-PT", { timeZone: "UTC", month: "long" }).format(
    new Date(Date.UTC(year, month - 1, 15)),
  );
  return `${name} ${year}`;
}

function platformCommissionPct(): number {
  const pct = Number(process.env.PLATFORM_COMMISSION_PCT ?? "10");
  return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 10;
}

const activeEntitlement = eq(entitlements.status, "active");

/**
 * Um bilhete que é dinheiro entrado: emitido (na mão de alguém) ou já usado à
 * porta. `pending` nunca pagou e `refunded` voltou para trás.
 *
 * Está definido AQUI, ao lado do `activeEntitlement`, e não junto da primeira
 * query que o usa, porque é a definição de "vendido" que o extrato e a
 * dashboard TÊM de partilhar — se os dois ecrãs contarem bilhetes diferentes,
 * a identidade entre eles deixa de bater e ninguém consegue explicar porquê.
 * A mesma definição está em `getEventTicketStats` (server/tickets.ts).
 */
const paidTicket = inArray(tickets.status, ["issued", "used"]);

const grossCents = sql<number>`coalesce(sum(${events.priceCents}), 0)`.mapWith(Number);

/*
 * ────────────────────────────────────────────────────────────────────────────
 *  A TAXA DA EUPAGO — dois números que estavam escritos dentro do SQL
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 0,07 € fixos + 0,7 % por transação MB WAY. É uma ESTIMATIVA nossa: o valor
 * que conta está no extrato da Eupago, e o ecrã diz isso onde os mostra.
 *
 * Passaram a constantes porque deixaram de estar num sítio só: com os bilhetes
 * no extrato há duas queries a aplicá-la (PPV e bilhetes) e a frase do rodapé a
 * escrevê-la por extenso. Três cópias de "0.007" é uma para ficar para trás no
 * dia em que a Eupago mudar de preçário.
 */
export const EUPAGO_FIXED_FEE_CENTS = 7;
export const EUPAGO_VARIABLE_RATE = 0.007;

/**
 * A taxa Eupago estimada de UMA transação, somada transação a transação.
 *
 * ⚠️  OS DOIS CASTS NÃO SÃO DECORAÇÃO — MEDIDO CONTRA O POSTGRES.
 *
 * Estes números estavam escritos LITERALMENTE dentro do texto SQL
 * (`round(price * 0.007)`), e aí o Postgres lia-os como `numeric`. Ao passarem
 * a constantes ligadas como PARÂMETRO, quem infere o tipo deixa de ser o
 * parser: o drizzle vê `${rate}` multiplicado por uma coluna `integer` e
 * declara o parâmetro como `int4`. O resultado foi imediato e não deu erro de
 * compilação nenhum:
 *
 *     PostgresError: invalid input syntax for type integer: "0.007"
 *
 * `::numeric` devolve-lhe o tipo certo. É a mesma família de armadilha do
 * `date_trunc(${unit})` documentada em `bucketOf` — um parâmetro ligado não é
 * um literal, e o que muda é o que o Postgres consegue inferir à volta dele.
 *
 * A aritmética fica toda em `numeric` (decimal exato) e nunca em vírgula
 * flutuante, que é o mínimo para uma conta de dinheiro.
 */
function eupagoFeeOf(priceColumn: AnyPgColumn): SQL<number> {
  return sql<number>`coalesce(sum(${EUPAGO_FIXED_FEE_CENTS}::int + round(${priceColumn} * ${EUPAGO_VARIABLE_RATE}::numeric)), 0)`.mapWith(
    Number,
  );
}

/**
 * A comissão da FirstRow de UMA transação, somada transação a transação.
 *
 * `sum(round(...))` e nunca `round(sum(...))`: é o que o split faz a cada
 * pagamento (`lib/split.ts`), e as duas fórmulas divergem em cêntimos a preços
 * cujo 10 % caia num meio cêntimo. Ver a nota em `eventEconomics`.
 */
function firstrowFeeOf(priceColumn: AnyPgColumn, pct: number): SQL<number> {
  return sql<number>`coalesce(sum(round(${priceColumn} * ${pct}::numeric / 100)), 0)`.mapWith(
    Number,
  );
}

export async function getDashboardStats(scope: ChannelScope): Promise<DashboardStats> {
  const now = new Date();
  const { start, end, key } = monthBounds(now);
  const mine = inChannelScope(scope);

  const [monthRow] = await db
    .select({ revenueCents: grossCents, purchases: count() })
    .from(entitlements)
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(
      and(
        activeEntitlement,
        gte(entitlements.createdAt, start),
        lt(entitlements.createdAt, end),
        mine,
      ),
    );

  // O join a `events` existe só para o âmbito: sem ele, a contagem de
  // compradores era a da plataforma toda em vez da dos canais desta pessoa.
  const [buyersRow] = await db
    .select({ buyers: countDistinct(entitlements.userId) })
    .from(entitlements)
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(and(activeEntitlement, mine));

  // Próximo evento: um live em curso ganha; senão, o rascunho mais próximo.
  const [liveEvent] = await db
    .select()
    .from(events)
    .where(and(eq(events.status, "live"), mine))
    .orderBy(desc(events.startsAt))
    .limit(1);
  const [upcoming] = liveEvent
    ? [liveEvent]
    : await db
        .select()
        .from(events)
        .where(and(eq(events.status, "draft"), gte(events.startsAt, now), mine))
        .orderBy(asc(events.startsAt))
        .limit(1);

  const [eventsRow] = await db.select({ n: count() }).from(events).where(mine);

  return {
    monthLabel: monthLabel(key),
    monthRevenueCents: monthRow?.revenueCents ?? 0,
    monthPurchases: monthRow?.purchases ?? 0,
    buyersTotal: buyersRow?.buyers ?? 0,
    nextEvent: upcoming ?? null,
    hasEvents: (eventsRow?.n ?? 0) > 0,
  };
}

export async function listRecentPayments(scope: ChannelScope, limit = 6): Promise<RecentPayment[]> {
  // TODO(frente-d): juntar (UNION) as compras de bilhetes físicos.
  const rows = await db
    .select({
      id: entitlements.id,
      createdAt: entitlements.createdAt,
      buyerName: user.name,
      eventId: events.id,
      eventTitle: events.title,
      channelId: events.channelId,
      amountCents: events.priceCents,
    })
    .from(entitlements)
    .innerJoin(user, eq(entitlements.userId, user.id))
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(and(activeEntitlement, inChannelScope(scope)))
    .orderBy(desc(entitlements.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, kind: "ppv" as const }));
}

/**
 * Eventos com compradores e receita.
 *
 * `since` limita as COMPRAS contadas, não os eventos listados: `null` conta
 * desde o início (é o que `/admin/eventos` quer — a lista de eventos é a lista
 * toda), uma data conta só o que entrou de lá para cá.
 *
 * ⚠️  O corte vai na condição do LEFT JOIN e não no `where`, e a diferença é
 * visível: no `where`, um evento sem compras dentro da janela desaparecia da
 * lista em vez de aparecer com zero. Um evento que existe e não vendeu nada
 * este mês é um facto que a lista tem de conseguir dizer.
 */
export async function listEventsWithSales(
  scope: ChannelScope,
  since: Date | null = null,
): Promise<EventWithSales[]> {
  const rows = await db
    .select({ event: events, buyers: count(entitlements.id) })
    .from(events)
    .leftJoin(
      entitlements,
      and(
        eq(entitlements.eventId, events.id),
        activeEntitlement,
        since ? gte(entitlements.createdAt, since) : undefined,
      ),
    )
    .where(inChannelScope(scope))
    .groupBy(events.id)
    .orderBy(desc(events.startsAt));
  // PPV com preço único por evento → receita = compradores × preço.
  return rows.map(({ event, buyers }) => ({
    ...event,
    buyers,
    revenueCents: buyers * event.priceCents,
  }));
}

/**
 * Um evento tal como a AGENDA o mostra a quem só opera: sem um número de
 * dinheiro dentro.
 *
 * `hasTickets` é um booleano CALCULADO NO POSTGRES (`is not null`) e não o
 * `ticketPriceCents` trazido para cá e comparado em JavaScript. A diferença é
 * toda: assim o preço do bilhete nunca sai da base de dados, logo não pode
 * aparecer no payload do RSC por distração de quem escrever o JSX a seguir.
 */
export type EventForOperations = {
  id: string;
  title: string;
  startsAt: Date;
  status: string;
  channelId: string;
  /** Tem bilhete de porta à venda → há scanner e lista de bilhetes para abrir. */
  hasTickets: boolean;
};

/**
 * A lista de eventos da agenda (`/admin/agenda`) — a zona `operate`.
 *
 * ⚠️  AS COLUNAS SÃO ESCOLHIDAS À MÃO, E ISSO É A FUNÇÃO INTEIRA.
 *
 * Não é `select()` nem `EventRow`: `listEventsInScope` (server/events.ts) traz
 * a linha completa, com `priceCents`, `ticketPriceCents` e `cfLiveInputId`.
 * Numa página servida ao `staff`, cada um desses é uma fuga — o preço é
 * dinheiro e o `cfLiveInputId` é o identificador da transmissão. O que esta
 * query não pede não pode escorrer.
 *
 * Não há aqui compradores, receita nem contagem de vendas por uma razão
 * diferente da do âmbito: mesmo o dono, se vier por este caminho, não os vê.
 * A agenda responde "o que há para operar", e a resposta a essa pergunta não
 * tem valores. Quem quer os números tem `/admin/eventos`.
 */
export async function listEventsForOperations(scope: ChannelScope): Promise<EventForOperations[]> {
  return db
    .select({
      id: events.id,
      title: events.title,
      startsAt: events.startsAt,
      status: events.status,
      channelId: events.channelId,
      hasTickets: sql<boolean>`${events.ticketPriceCents} is not null`.mapWith(Boolean),
    })
    .from(events)
    .where(inChannelScope(scope))
    .orderBy(desc(events.startsAt));
}

export async function getEventSales(
  eventId: string,
): Promise<{ buyers: number; revenueCents: number }> {
  const [row] = await db
    .select({ buyers: count(), revenueCents: grossCents })
    .from(entitlements)
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(and(eq(entitlements.eventId, eventId), activeEntitlement));
  return row ?? { buyers: 0, revenueCents: 0 };
}

// Espectadores ativos: sessões não revogadas com heartbeat nos últimos 30s
// (o player envia heartbeat a cada 20s — ver components/player/watch-player.tsx).
export async function countActiveViewers(eventId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 30_000);
  const [row] = await db
    .select({ n: count() })
    .from(playbackSessions)
    .where(
      and(
        eq(playbackSessions.eventId, eventId),
        isNull(playbackSessions.revokedAt),
        gte(playbackSessions.lastHeartbeatAt, cutoff),
      ),
    );
  return row?.n ?? 0;
}

// Sessões bloqueadas hoje (dia de Lisboa): revogadas pela regra
// 1-sessão-por-conta — uma nova sessão da mesma conta corta a anterior.
export async function listBlockedSessionsToday(
  eventId: string,
  limit = 12,
): Promise<{ total: number; rows: BlockedSession[] }> {
  const since = lisbonDayStartUtc();
  const blockedToday = and(
    eq(playbackSessions.eventId, eventId),
    isNotNull(playbackSessions.revokedAt),
    gte(playbackSessions.revokedAt, since),
  );

  const [totalRow] = await db.select({ n: count() }).from(playbackSessions).where(blockedToday);
  const rows = await db
    .select({ id: playbackSessions.id, email: user.email, revokedAt: playbackSessions.revokedAt })
    .from(playbackSessions)
    .innerJoin(user, eq(playbackSessions.userId, user.id))
    .where(blockedToday)
    .orderBy(desc(playbackSessions.revokedAt))
    .limit(limit);

  return {
    total: totalRow?.n ?? 0,
    rows: rows.map((r) => ({ ...r, revokedAt: r.revokedAt ?? since })),
  };
}

/**
 * Compradores — nome e email. É a resposta mais sensível do backoffice em
 * dados pessoais, e por isso a que mais precisa do âmbito: sem ele, abrir
 * `/admin/subscritores` numa liga dava a lista de contactos de todas as outras.
 */
export async function listBuyers(scope: ChannelScope): Promise<BuyerRow[]> {
  const lastPurchaseAt = max(entitlements.createdAt);
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      purchases: count(),
      lastPurchaseAt,
      totalCents: grossCents,
    })
    .from(entitlements)
    .innerJoin(user, eq(entitlements.userId, user.id))
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(and(activeEntitlement, inChannelScope(scope)))
    .groupBy(user.id, user.name, user.email)
    .orderBy(desc(lastPurchaseAt));
  return rows.map((r) => ({ ...r, lastPurchaseAt: r.lastPurchaseAt ?? new Date(0) }));
}

/**
 * O extrato, mês a mês **e canal a canal**.
 *
 * Agrupar também por canal não é um detalhe de apresentação: o dinheiro
 * paga-se a cada liga, e um total somado de duas ligas não serve para pagar
 * nenhuma delas. Filtrar já garantia que ninguém via o dinheiro alheio; isto
 * garante que quem tem duas ligas consegue dizer quanto é de cada uma.
 *
 * Com um canal só — hoje, e sempre para o dono de uma liga — o agrupamento dá
 * exatamente as mesmas linhas de antes, e o ecrã nem mostra a coluna.
 *
 * As taxas continuam somadas POR TRANSAÇÃO (`sum(round(...))`, não
 * `round(sum(...))`), por isso a mudança de agrupamento não mexe um cêntimo no
 * total: mudar de sítio a soma de valores já arredondados dá o mesmo.
 */
export async function getMonthlyStatement(scope: ChannelScope): Promise<{
  commissionPct: number;
  rows: MonthlyStatementRow[];
}> {
  const pct = platformCommissionPct();
  const mine = inChannelScope(scope);

  /*
   * O mês de cada origem sai da SUA data de compra: `entitlements.created_at`
   * para o PPV, `tickets.created_at` para os bilhetes. Não é o mesmo que a data
   * do evento — um bilhete vendido em junho para um evento de julho é
   * faturação de junho, que é quando o dinheiro entrou.
   */
  const ppvMonth = sql<string>`to_char(${entitlements.createdAt} at time zone 'UTC' at time zone 'Europe/Lisbon', 'YYYY-MM')`;
  const ticketMonth = sql<string>`to_char(${tickets.createdAt} at time zone 'UTC' at time zone 'Europe/Lisbon', 'YYYY-MM')`;

  /*
   * DUAS queries e um merge, e não um join só — a armadilha de cardinalidade já
   * documentada em `getPlatformEconomics`, `getRevenueByPeriod` e
   * `listChannelsInScope`: um evento com 100 acessos e 30 bilhetes numa query
   * agrupada dava 3000 de cada, sem erro nenhum a assinalá-lo.
   *
   * O join a `channels` é só para a ORDEM: dentro do mesmo mês os canais saem
   * pela ordem que valem no resto da app (o mais antigo à cabeça), e não pela
   * ordem arbitrária dos ids. Por isso `channels.createdAt` vem no select — é
   * o que permite reproduzir essa ordem depois do merge, em JavaScript.
   */
  const [ppvRows, ticketRows] = await Promise.all([
    db
      .select({
        monthKey: ppvMonth,
        channelId: events.channelId,
        channelCreatedAt: channels.createdAt,
        cents: grossCents,
        n: count(),
        firstrowFeeCents: firstrowFeeOf(events.priceCents, pct),
        eupagoFeeCents: eupagoFeeOf(events.priceCents),
      })
      .from(entitlements)
      .innerJoin(events, eq(entitlements.eventId, events.id))
      .innerJoin(channels, eq(events.channelId, channels.id))
      .where(and(activeEntitlement, mine))
      .groupBy(ppvMonth, events.channelId, channels.createdAt),
    db
      .select({
        monthKey: ticketMonth,
        channelId: events.channelId,
        channelCreatedAt: channels.createdAt,
        // `tickets.price_cents` — a cópia por bilhete, nunca `events`.
        cents: sql<number>`coalesce(sum(${tickets.priceCents}), 0)`.mapWith(Number),
        n: count(),
        firstrowFeeCents: firstrowFeeOf(tickets.priceCents, pct),
        eupagoFeeCents: eupagoFeeOf(tickets.priceCents),
      })
      .from(tickets)
      // O join a `events` é o âmbito: `tickets` não tem canal. Sem ele, esta
      // query respondia com os bilhetes da plataforma toda.
      .innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(channels, eq(events.channelId, channels.id))
      .where(and(paidTicket, mine))
      .groupBy(ticketMonth, events.channelId, channels.createdAt),
  ]);

  type Acumulador = MonthlyStatementRow & { channelCreatedAt: Date };
  const porChave = new Map<string, Acumulador>();
  const linha = (monthKey: string, channelId: string, channelCreatedAt: Date): Acumulador => {
    const chave = `${monthKey}·${channelId}`;
    const atual = porChave.get(chave) ?? {
      monthKey,
      monthLabel: monthLabel(monthKey),
      channelId,
      channelCreatedAt,
      ppvGrossCents: 0,
      ppvPurchases: 0,
      ticketGrossCents: 0,
      ticketsSold: 0,
      grossCents: 0,
      purchases: 0,
      firstrowFeeCents: 0,
      eupagoFeeCents: 0,
      netCents: 0,
    };
    porChave.set(chave, atual);
    return atual;
  };

  for (const r of ppvRows) {
    const alvo = linha(r.monthKey, r.channelId, r.channelCreatedAt);
    alvo.ppvGrossCents += r.cents;
    alvo.ppvPurchases += r.n;
    alvo.firstrowFeeCents += r.firstrowFeeCents;
    alvo.eupagoFeeCents += r.eupagoFeeCents;
  }
  for (const r of ticketRows) {
    const alvo = linha(r.monthKey, r.channelId, r.channelCreatedAt);
    alvo.ticketGrossCents += r.cents;
    alvo.ticketsSold += r.n;
    alvo.firstrowFeeCents += r.firstrowFeeCents;
    alvo.eupagoFeeCents += r.eupagoFeeCents;
  }

  /*
   * Os totais derivam-se só no fim, das parcelas JÁ arredondadas por transação.
   * É o que garante que somar as duas origens não mexe um cêntimo: mudar de
   * sítio a soma de valores já arredondados dá o mesmo resultado.
   */
  const rows = [...porChave.values()]
    .map((r) => {
      r.grossCents = r.ppvGrossCents + r.ticketGrossCents;
      r.purchases = r.ppvPurchases + r.ticketsSold;
      r.netCents = r.grossCents - r.firstrowFeeCents - r.eupagoFeeCents;
      return r;
    })
    .sort(
      (a, b) =>
        b.monthKey.localeCompare(a.monthKey) ||
        a.channelCreatedAt.getTime() - b.channelCreatedAt.getTime(),
    )
    // `channelCreatedAt` serviu a ordem e não tem que ir para o ecrã.
    .map(({ channelCreatedAt: _ordem, ...row }) => row);

  return { commissionPct: pct, rows };
}

/*
 * ============================================================================
 *  MINUTOS ENTREGUES — a estimativa, e porque é que é uma estimativa
 * ============================================================================
 *
 * A analítica da Cloudflare não está ao nosso alcance: o token da conta não tem
 * essa permissão (testado). A única fonte que temos é NOSSA — a tabela
 * `playback_sessions`, onde o player carimba `lastHeartbeatAt` de 20 em 20
 * segundos enquanto alguém está a ver.
 *
 *     duração da sessão ≈ lastHeartbeatAt − startedAt
 *
 * ⚠️  ISTO NÃO É O QUE A CLOUDFLARE FATURA, e o ecrã tem de o dizer. Ela cobra
 * o que a rede dela entregou; nós vemos o que o nosso heartbeat viu. Prometer
 * precisão que não temos é pior do que dar um número honesto — daí "custo
 * ESTIMADO" em todo o lado, e nunca "custo".
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  OS CASOS QUE SUJAM A ESTIMATIVA, E O QUE SE DECIDIU EM CADA UM
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. SESSÃO QUE NUNCA FECHOU (alguém fechou o portátil).
 *    Resolve-se sozinha, e é por isso que a fórmula é esta: sem heartbeat, o
 *    `lastHeartbeatAt` PÁRA — não continua a crescer como um `now()` faria. O
 *    erro fica limitado ao intervalo do heartbeat (≤ 20 s), sempre para MENOS.
 *    Uma fórmula com `now()` para as sessões abertas transformava um portátil
 *    esquecido numa sessão de dias.
 *
 * 2. SESSÃO CORTADA PELA REGRA DE 1-SESSÃO-POR-CONTA (`revokedAt`).
 *    CONTA-SE à mesma: aqueles minutos foram entregues de verdade, e a
 *    Cloudflare cobrou-os independentemente de nós termos cortado a sessão a
 *    seguir. Descontá-los era fingir um custo mais baixo do que a fatura.
 *    O fim efetivo é `least(lastHeartbeatAt, revokedAt)`. Hoje o `revokedAt` é
 *    sempre o mais tarde dos dois — `heartbeat()` devolve `false` e NÃO carimba
 *    quando a sessão já está revogada (`server/playback.ts`) — por isso o
 *    `least` é redundante. Fica na mesma: custa nada e é o que impede que uma
 *    mudança futura no heartbeat comece a contar minutos depois do corte.
 *
 * 3. DURAÇÃO NEGATIVA (relógios trocados). É real e não teórico: `startedAt`
 *    vem do `defaultNow()` da BASE DE DADOS e `lastHeartbeatAt` de um `new
 *    Date()` do SERVIDOR DE APLICAÇÃO (`server/playback.ts`). São relógios
 *    diferentes, e na Vercel são máquinas diferentes. Um servidor alguns
 *    milissegundos atrasado dava uma duração negativa, que subtraía minutos ao
 *    total do evento. `greatest(0, …)` fecha isso.
 *
 * 4. SESSÃO ABSURDAMENTE LONGA. Teto de `MAX_SESSION_MINUTES` por sessão, e as
 *    truncadas são CONTADAS para o ecrã as poder confessar. Ver a justificação
 *    do teto em `lib/video-costs.ts`.
 *
 * 5. SESSÃO DE DURAÇÃO ZERO (abriu e fechou). Conta como sessão, soma zero
 *    minutos. É a diferença entre "ninguém viu" e "não sabemos" — e é essa
 *    diferença que faz o ecrã mostrar "—" em vez de "0,00 €".
 *
 * Os segundos somam-se todos e só no fim é que viram minutos. Arredondar sessão
 * a sessão empurrava o total para cima em eventos com muitas sessões curtas.
 */

// O fim efetivo de uma sessão, e a sua duração em segundos, com os casos 2 e 3
// já tratados. Fragmentos reutilizados para que a expressão exista UMA vez.
const sessionEndsAt = sql`least(${playbackSessions.lastHeartbeatAt}, coalesce(${playbackSessions.revokedAt}, ${playbackSessions.lastHeartbeatAt}))`;
const sessionSeconds = sql`greatest(0, extract(epoch from (${sessionEndsAt} - ${playbackSessions.startedAt})))`;
// `sql.raw` de uma constante NOSSA, não de nada que venha de fora: um parâmetro
// ligado aqui deixava o Postgres sem tipo para inferir dentro do `least`.
const capSeconds = sql.raw(String(MAX_SESSION_MINUTES * 60));

/**
 * Minutos entregues por evento, para os canais do âmbito.
 *
 * Eventos sem uma única sessão NÃO aparecem no mapa — de propósito. "Ausente" é
 * o que permite a quem chama distinguir "não sabemos" de "zero", e é o que faz
 * o ecrã mostrar "sem dados" em vez de um zero com ar de facto.
 *
 * `since` corta pelo INÍCIO da sessão (`startedAt`), e não pelo fim: é quando a
 * entrega começou a contar. Uma sessão aberta antes da janela e fechada dentro
 * dela fica de fora inteira — é a escolha certa das duas más, porque a
 * alternativa (parti-la ao meio) obrigava a inventar quantos minutos caíram de
 * cada lado, e o ecrã passaria a mostrar um número que nenhuma linha da base de
 * dados justifica. Com eventos de 2-3 h e janelas de 30 dias, o erro é uma
 * sessão a cavalo da meia-noite do primeiro dia.
 */
export async function getDeliveryByEvent(
  scope: ChannelScope,
  since: Date | null = null,
): Promise<Map<string, DeliveryEstimate>> {
  const rows = await db
    .select({
      eventId: playbackSessions.eventId,
      sessions: count(),
      seconds: sql<number>`coalesce(sum(least(${sessionSeconds}, ${capSeconds})), 0)`.mapWith(
        Number,
      ),
      cappedSessions:
        sql<number>`count(*) filter (where ${sessionSeconds} > ${capSeconds})`.mapWith(Number),
    })
    .from(playbackSessions)
    // O join a `events` existe só para o âmbito: `playback_sessions` não tem
    // canal, e sem ele esta query respondia com as sessões de toda a plataforma.
    .innerJoin(events, eq(playbackSessions.eventId, events.id))
    .where(and(inChannelScope(scope), since ? gte(playbackSessions.startedAt, since) : undefined))
    .groupBy(playbackSessions.eventId);

  return new Map(
    rows.map((row) => [
      row.eventId,
      {
        sessions: row.sessions,
        minutes: Math.round(row.seconds / 60),
        cappedSessions: row.cappedSessions,
      },
    ]),
  );
}

/**
 * Uma linha da economia por evento.
 *
 * Colunas escolhidas à mão em vez de `EventRow` inteiro, pela mesma razão do
 * `PUBLIC_COLUMNS` em `server/channels.ts`: isto viaja para o browser no
 * payload do RSC, e o `EventRow` traz `cfLiveInputId` — o identificador da
 * transmissão não tem nada que fazer num ecrã de contas.
 */
export type EventEconomicsRow = EventEconomics & {
  eventId: string;
  title: string;
  startsAt: Date;
  channelId: string;
  buyers: number;
  sessions: number;
  cappedSessions: number;
};

export type PlatformEconomics = {
  commissionPct: number;
  /** A taxa usada na conversão, para o ecrã a poder escrever. */
  usdToEur: number;
  /**
   * A janela a que estes números se referem — "90 dias", ou `null` para desde o
   * início.
   *
   * Viaja DENTRO do objeto, e não como prop separada dos componentes, por uma
   * razão prática: os três sítios que mostram economia (os cartões de
   * `/admin/plataforma`, o gráfico da margem e o bloco de `/admin/ganhos`)
   * recebem todos este objeto e mais nada. Um rótulo à parte era um quarto
   * argumento para alguém se esquecer de passar — e um cartão a dizer "90 dias"
   * ao lado de números de sempre é precisamente o erro que esta frente veio
   * corrigir.
   */
  periodLabel: string | null;
  rows: EventEconomicsRow[];
  totals: EconomicsTotals;
};

/**
 * Receita, comissão e custo estimado de vídeo, evento a evento.
 *
 * DUAS queries e um merge, e não um join só: `entitlements` e
 * `playback_sessions` têm cardinalidades diferentes e, na mesma query agrupada,
 * cada compra multiplicava cada sessão — as contagens saíam infladas sem dar
 * erro nenhum. É a mesma armadilha já documentada em
 * `listChannelsInScope` (server/channels.ts) e em `countSalesByEvent`.
 *
 * As duas queries levam o MESMO âmbito. Tem de ser: uma lista de eventos mais
 * larga do que o mapa de minutos (ou o contrário) dava linhas de um canal com
 * os minutos de outro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  E LEVAM A MESMA JANELA, PELA MESMÍSSIMA RAZÃO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `period` é a janela temporal; `null` conta desde o início, que é o que
 * `/admin/ganhos` quer (não tem seletor — o extrato é a história toda).
 *
 * Isto NÃO tinha janela nenhuma, e o efeito era um ecrã a dizer duas coisas
 * sobre o mesmo intervalo: em `/admin/plataforma` os cartões "Receita" e
 * "Comissão" respeitavam o seletor de período e os cartões "Custo de vídeo" e
 * "Margem" somavam desde sempre, lado a lado, com a diferença confessada numa
 * pista em letra pequena. Uma comissão de 90 dias comparada com um custo de
 * vídeo de sempre não é um rácio de coisa nenhuma.
 *
 * As duas queries recebem o MESMO `since`: compradores de uma janela com
 * minutos de outra dava exatamente o rácio falso que se veio corrigir.
 */
export async function getPlatformEconomics(
  scope: ChannelScope,
  period: PeriodKey | null = null,
  now = new Date(),
): Promise<PlatformEconomics> {
  const commissionPct = platformCommissionPct();
  // A taxa é lida AQUI, do lado do servidor, e entregue pura ao modelo — ver a
  // nota sobre `NEXT_PUBLIC_` no topo de `lib/video-costs.ts`.
  const usdToEur = resolveUsdToEur(process.env.USD_TO_EUR_RATE);
  const since = period ? periodStart(period, now) : null;

  const [eventRows, delivery] = await Promise.all([
    listEventsWithSales(scope, since),
    getDeliveryByEvent(scope, since),
  ]);

  const rows = eventRows
    .map((event) => {
      const estimate = delivery.get(event.id) ?? null;
      return {
        eventId: event.id,
        title: event.title,
        startsAt: event.startsAt,
        channelId: event.channelId,
        buyers: event.buyers,
        sessions: estimate?.sessions ?? 0,
        cappedSessions: estimate?.cappedSessions ?? 0,
        ...eventEconomics({
          buyers: event.buyers,
          unitPriceCents: event.priceCents,
          commissionPct,
          delivery: estimate,
          usdToEur,
        }),
      };
    })
    // Um rascunho que nunca vendeu nem foi visto não tem economia nenhuma para
    // mostrar — só empurrava para fora do ecrã os eventos que têm.
    .filter((row) => row.buyers > 0 || row.sessions > 0);

  return {
    commissionPct,
    usdToEur,
    periodLabel: period ? PERIODS[period].label : null,
    rows,
    totals: totalEconomics(rows),
  };
}

/**
 * Totais da plataforma inteira, de propósito e sem âmbito — é o ecrã interno
 * da FirstRow (`/admin/plataforma`).
 *
 * ⚠️  Sendo a única função daqui que NÃO leva âmbito, é também a única que só
 * pode ser chamada atrás de `isPlatformAdmin`. A página faz esse gate; se
 * alguém a chamar de outro sítio, tem de o repetir. Até esta frente, a página
 * vivia só com o gate do layout (`league_owner` entrava) e um dono de liga via
 * daqui a receita total e a contagem de contas de toda a plataforma.
 */
export async function getPlatformTotals(): Promise<PlatformTotals> {
  const [usersRow] = await db.select({ n: count() }).from(user);
  const [eventsRow] = await db.select({ n: count() }).from(events);
  const [revenueRow] = await db
    .select({ total: grossCents })
    .from(entitlements)
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(activeEntitlement);
  return {
    users: usersRow?.n ?? 0,
    events: eventsRow?.n ?? 0,
    revenueCents: revenueRow?.total ?? 0,
  };
}

/*
 * ============================================================================
 *  A VISTA GLOBAL DA FIRSTROW — séries temporais para `/admin/plataforma`
 * ============================================================================
 *
 * Tudo daqui para baixo alimenta a dashboard do `platform_admin`. Continua a
 * levar `ChannelScope` — e não é cerimónia inútil por o gate de hoje garantir
 * `{ all: true }`: é o que impede que alargar o gate amanhã abra uma fuga sem
 * ninguém mexer nestas queries. A mesma decisão já tomada em `/admin/ganhos`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  BILHETES ENTRAM AQUI, MAS SEPARADOS DO PPV — E ISSO É O PONTO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Se esta dashboard somasse PPV + bilhetes num único "receita", perdia-se a
 * única forma de reconciliar dois ecrãs sobre o mesmo dinheiro. A saída não é
 * esconder os bilhetes (são dinheiro real que já entrou): é NUNCA os fundir.
 * Cada balde traz `ppv*` e `ticket*` em campos separados.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  A IDENTIDADE COM O EXTRATO — ESTENDIDA, NÃO APAGADA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O extrato contava só PPV, e a regra era:
 *
 *     soma dos `ppvCents`           ≡ `grossCents` do extrato
 *     soma dos `ppvCommissionCents` ≡ `firstrowFeeCents` do extrato
 *
 * Com os bilhetes no extrato, cada lado ganhou a sua parcela e a igualdade
 * passou a ser sobre a SOMA das duas — verificada em teste, ao cêntimo, para o
 * mesmo âmbito e o mesmo intervalo:
 *
 *     ppvCents           ≡ `ppvGrossCents`    do extrato
 *     ticketCents        ≡ `ticketGrossCents` do extrato
 *     ppv + ticket       ≡ `grossCents`       do extrato
 *     comissão ppv+ticket ≡ `firstrowFeeCents` do extrato
 *
 * As parcelas batem UMA A UMA e não só no total. É de propósito: dois erros
 * simétricos — PPV a mais e bilhetes a menos — davam um total certo e dois
 * números errados, e um teste só sobre o total deixava-os passar.
 *
 * A COMISSÃO ARREDONDA-SE POR TRANSAÇÃO (`sum(round(...))`), como em
 * `getMonthlyStatement` e em `lib/split.ts`. `round(sum(...))` divergia em
 * cêntimos e era exatamente o tipo de diferença que ninguém consegue explicar.
 * Os dois ecrãs partilham a MESMA expressão (`firstrowFeeOf`) para que isso
 * seja verdade por construção, e não por as duas cópias coincidirem.
 */

/** O passo do eixo do tempo. Amarrado ao período — ver `PERIODS`. */
export type BucketUnit = "week" | "month";

export type PeriodKey = "30d" | "90d" | "12m";

/**
 * Os períodos que a dashboard oferece, com o passo já decidido.
 *
 * O passo anda AGARRADO ao período de propósito: dois controlos independentes
 * ("90 dias" × "por mês") produzem combinações que não dizem nada — três
 * colunas — e obrigam quem lê a perceber porquê. Aqui há uma escolha só.
 */
export const PERIODS: Record<PeriodKey, { label: string; days: number; unit: BucketUnit }> = {
  "30d": { label: "30 dias", days: 30, unit: "week" },
  "90d": { label: "90 dias", days: 90, unit: "week" },
  "12m": { label: "12 meses", days: 365, unit: "month" },
};

export const DEFAULT_PERIOD: PeriodKey = "90d";

export function isPeriodKey(value: unknown): value is PeriodKey {
  return typeof value === "string" && Object.hasOwn(PERIODS, value);
}

/** O período pedido no URL, ou o de referência. Nunca lança. */
export function resolvePeriod(value: unknown): PeriodKey {
  return isPeriodKey(value) ? value : DEFAULT_PERIOD;
}

const DAY_MS = 86_400_000;

/**
 * O instante em que o período começa: meia-noite de Lisboa, `days` dias atrás.
 *
 * Meia-noite e não "agora menos N×24h" porque os baldes são dias de calendário:
 * um corte a meio do dia partia o primeiro balde em dois e a primeira coluna do
 * gráfico aparecia sempre mais baixa do que as outras, sem ser por vender menos.
 */
function periodStart(period: PeriodKey, now = new Date()): Date {
  const { days, unit } = PERIODS[period];
  const { year, month, day } = lisbonParts(new Date(now.getTime() - (days - 1) * DAY_MS));
  // Em meses, o período abre no dia 1 — senão o primeiro balde é um mês cortado.
  return unit === "month" ? lisbonMidnightUtc(year, month, 1) : lisbonMidnightUtc(year, month, day);
}

// ── Baldes de calendário ────────────────────────────────────────────────────

/*
 * As chaves de balde são a DATA DE PAREDE de Lisboa em "YYYY-MM-DD" — o que o
 * Postgres devolve de `date_trunc(unidade, … at time zone 'Europe/Lisbon')`.
 *
 * Do lado do JavaScript, gerá-las é aritmética de CALENDÁRIO e não de
 * instantes: usa-se `Date.UTC` sobre a data de parede, sem fuso nenhum pelo
 * meio. Misturar as duas coisas é onde nascem os erros de uma hora — em
 * Portugal, uma semana atravessa a mudança de hora duas vezes por ano e um
 * "somar 7 × 86400000 ms" a um instante devolve o domingo às 23:00.
 */

/** Data de parede (ms de `Date.UTC`) → "YYYY-MM-DD". */
function wallKey(wallMs: number): string {
  return new Date(wallMs).toISOString().slice(0, 10);
}

/** A data de parede de Lisboa de um instante, em ms de `Date.UTC`. */
function wallMsOf(instant: Date): number {
  const { year, month, day } = lisbonParts(instant);
  return Date.UTC(year, month - 1, day);
}

/**
 * Todos os baldes entre dois instantes, sem furos.
 *
 * Os furos preenchem-se de propósito: dentro de um período em que a plataforma
 * esteve a funcionar, uma semana sem vendas É UM FACTO — ninguém comprou — e
 * saltá-la no eixo desenhava uma linha contínua onde houve uma paragem. O que
 * NÃO se faz é desenhar o gráfico quando não há uma única linha de dados: aí a
 * página mostra o estado vazio, porque zeros sem histórico parecem um facto e
 * não são.
 */
export function bucketKeysBetween(start: Date, end: Date, unit: BucketUnit): string[] {
  const chaves: string[] = [];
  const fim = wallMsOf(end);

  if (unit === "month") {
    const { year, month } = lisbonParts(start);
    for (let ano = year, mes = month; Date.UTC(ano, mes - 1, 1) <= fim; ) {
      chaves.push(wallKey(Date.UTC(ano, mes - 1, 1)));
      if (mes === 12) {
        ano += 1;
        mes = 1;
      } else {
        mes += 1;
      }
    }
    return chaves;
  }

  // Semana ISO: `date_trunc('week', …)` do Postgres devolve SEGUNDA-feira.
  // `getUTCDay()` sobre a data de parede dá 0=domingo, por isso o recuo até
  // segunda é `(dia + 6) % 7`.
  const inicio = wallMsOf(start);
  const recuo = (new Date(inicio).getUTCDay() + 6) % 7;
  for (let ms = inicio - recuo * DAY_MS; ms <= fim; ms += 7 * DAY_MS) {
    chaves.push(wallKey(ms));
  }
  return chaves;
}

/**
 * A expressão SQL do balde de uma coluna de data.
 *
 * `date_trunc` sobre a hora de LISBOA, não sobre UTC: uma compra à meia-noite e
 * meia de um domingo é do domingo para quem a fez e para quem lê o gráfico. Com
 * `date_trunc` em UTC no verão (UTC+1) essa compra caía na semana anterior.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  A UNIDADE É LITERAL NO TEXTO, E NÃO UM PARÂMETRO LIGADO — MEDIDO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A primeira versão escrevia `date_trunc(${unit}, …)`, com a unidade ligada. É
 * o instinto certo (parâmetros ligados não se injetam) e aqui **não compila**:
 *
 *     column "entitlements.created_at" must appear in the GROUP BY clause
 *
 * Porquê: a mesma expressão vai ao `select` e ao `group by`, e o drizzle
 * numera os parâmetros por posição — sai `date_trunc($1, …)` num sítio e
 * `date_trunc($4, …)` no outro. O Postgres compara as expressões do `group by`
 * pela árvore, e dois parâmetros diferentes são dois nós diferentes: ele não
 * tem como saber que `$1` e `$4` vão levar o mesmo valor. Com a unidade
 * escrita no texto, as duas expressões ficam idênticas e a comparação passa.
 * (É por isto que o `getMonthlyStatement`, que não liga parâmetro nenhum na
 * expressão do mês, sempre funcionou.)
 *
 * `sql.raw` de uma constante NOSSA, exactamente como o `capSeconds` acima: o
 * valor sai da união fechada `BucketUnit`, reescolhido aqui num `if` para que
 * nem um `BucketUnit` inventado por um cast consiga pôr texto no SQL. O que
 * vem do URL passa primeiro por `resolvePeriod`, que só devolve chaves de
 * `PERIODS`.
 */
function bucketOf(column: AnyPgColumn, unit: BucketUnit): SQL<string> {
  const unidade = sql.raw(unit === "month" ? "month" : "week");
  return sql<string>`to_char(date_trunc('${unidade}', ${column} at time zone 'UTC' at time zone 'Europe/Lisbon'), 'YYYY-MM-DD')`;
}

// ── Receita por período, canal a canal ──────────────────────────────────────

export type RevenueBucket = {
  /** Início do balde, data de parede de Lisboa ("2026-07-13"). */
  bucket: string;
  channelId: string;
  ppvCents: number;
  ppvPurchases: number;
  ppvCommissionCents: number;
  ticketCents: number;
  ticketsSold: number;
  ticketCommissionCents: number;
};

export type RevenueSeries = {
  unit: BucketUnit;
  commissionPct: number;
  /** Todos os baldes do período, por ordem e sem furos. */
  buckets: string[];
  /** Canais com movimento no período — ordem estável (o mais antigo à cabeça). */
  channelIds: string[];
  rows: RevenueBucket[];
  totals: Omit<RevenueBucket, "bucket" | "channelId">;
};

/**
 * Receita por semana/mês e por canal.
 *
 * DUAS queries e um merge, e não um join só — a mesma armadilha de cardinalidade
 * já documentada em `getPlatformEconomics` e em `listChannelsInScope`: PPV e
 * bilhetes do mesmo evento multiplicavam-se um pelo outro e os totais saíam
 * inflados sem dar erro nenhum.
 */
export async function getRevenueByPeriod(
  scope: ChannelScope,
  period: PeriodKey,
  now = new Date(),
): Promise<RevenueSeries> {
  const pct = platformCommissionPct();
  const { unit } = PERIODS[period];
  const start = periodStart(period, now);
  const mine = inChannelScope(scope);

  // A MESMA expressão de comissão que o extrato usa (`firstrowFeeOf`), e não
  // uma cópia: é essa partilha que faz a identidade entre os dois ecrãs bater
  // ao cêntimo por construção, em vez de por coincidência.
  const feeOf = (priceColumn: AnyPgColumn) => firstrowFeeOf(priceColumn, pct);

  const [ppvRows, ticketRows] = await Promise.all([
    db
      .select({
        bucket: bucketOf(entitlements.createdAt, unit),
        channelId: events.channelId,
        cents: grossCents,
        n: count(),
        feeCents: feeOf(events.priceCents),
      })
      .from(entitlements)
      .innerJoin(events, eq(entitlements.eventId, events.id))
      .where(and(activeEntitlement, gte(entitlements.createdAt, start), mine))
      .groupBy(bucketOf(entitlements.createdAt, unit), events.channelId),
    db
      .select({
        bucket: bucketOf(tickets.createdAt, unit),
        channelId: events.channelId,
        cents: sql<number>`coalesce(sum(${tickets.priceCents}), 0)`.mapWith(Number),
        n: count(),
        feeCents: feeOf(tickets.priceCents),
      })
      .from(tickets)
      // O join a `events` é o âmbito: `tickets` não tem canal. Sem ele, esta
      // query respondia com os bilhetes da plataforma toda.
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(and(paidTicket, gte(tickets.createdAt, start), mine))
      .groupBy(bucketOf(tickets.createdAt, unit), events.channelId),
  ]);

  const porChave = new Map<string, RevenueBucket>();
  const vazio = (bucket: string, channelId: string): RevenueBucket => ({
    bucket,
    channelId,
    ppvCents: 0,
    ppvPurchases: 0,
    ppvCommissionCents: 0,
    ticketCents: 0,
    ticketsSold: 0,
    ticketCommissionCents: 0,
  });
  const linha = (bucket: string, channelId: string) => {
    const chave = `${bucket}·${channelId}`;
    const atual = porChave.get(chave) ?? vazio(bucket, channelId);
    porChave.set(chave, atual);
    return atual;
  };

  for (const r of ppvRows) {
    const alvo = linha(r.bucket, r.channelId);
    alvo.ppvCents += r.cents;
    alvo.ppvPurchases += r.n;
    alvo.ppvCommissionCents += r.feeCents;
  }
  for (const r of ticketRows) {
    const alvo = linha(r.bucket, r.channelId);
    alvo.ticketCents += r.cents;
    alvo.ticketsSold += r.n;
    alvo.ticketCommissionCents += r.feeCents;
  }

  const rows = [...porChave.values()].sort(
    (a, b) => a.bucket.localeCompare(b.bucket) || a.channelId.localeCompare(b.channelId),
  );

  const totals = rows.reduce(
    (acc, r) => ({
      ppvCents: acc.ppvCents + r.ppvCents,
      ppvPurchases: acc.ppvPurchases + r.ppvPurchases,
      ppvCommissionCents: acc.ppvCommissionCents + r.ppvCommissionCents,
      ticketCents: acc.ticketCents + r.ticketCents,
      ticketsSold: acc.ticketsSold + r.ticketsSold,
      ticketCommissionCents: acc.ticketCommissionCents + r.ticketCommissionCents,
    }),
    {
      ppvCents: 0,
      ppvPurchases: 0,
      ppvCommissionCents: 0,
      ticketCents: 0,
      ticketsSold: 0,
      ticketCommissionCents: 0,
    },
  );

  return {
    unit,
    commissionPct: pct,
    buckets: bucketKeysBetween(start, now, unit),
    channelIds: [...new Set(rows.map((r) => r.channelId))],
    rows,
    totals,
  };
}

// ── Vendas por evento: PPV vs bilhetes ──────────────────────────────────────

export type EventSalesRow = {
  eventId: string;
  title: string;
  channelId: string;
  startsAt: Date;
  ppvBuyers: number;
  ppvCents: number;
  ticketsSold: number;
  ticketCents: number;
  /** PPV + bilhetes, já arredondada por transação. */
  commissionCents: number;
};

/**
 * O que cada evento vendeu, pelos dois canais de venda que existem.
 *
 * Outra vez duas queries e um merge, pela razão do costume: um evento com 100
 * acessos e 30 bilhetes numa query agrupada dava 3000 de cada.
 */
export async function listSalesByEvent(
  scope: ChannelScope,
  period: PeriodKey,
  now = new Date(),
): Promise<{ commissionPct: number; rows: EventSalesRow[] }> {
  const pct = platformCommissionPct();
  const start = periodStart(period, now);
  const mine = inChannelScope(scope);

  const [ppvRows, ticketRows, eventRows] = await Promise.all([
    db
      .select({
        eventId: entitlements.eventId,
        buyers: count(),
        cents: grossCents,
        feeCents:
          sql<number>`coalesce(sum(round(${events.priceCents} * ${pct}::numeric / 100)), 0)`.mapWith(
            Number,
          ),
      })
      .from(entitlements)
      .innerJoin(events, eq(entitlements.eventId, events.id))
      .where(and(activeEntitlement, gte(entitlements.createdAt, start), mine))
      .groupBy(entitlements.eventId),
    db
      .select({
        eventId: tickets.eventId,
        sold: count(),
        cents: sql<number>`coalesce(sum(${tickets.priceCents}), 0)`.mapWith(Number),
        feeCents:
          sql<number>`coalesce(sum(round(${tickets.priceCents} * ${pct}::numeric / 100)), 0)`.mapWith(
            Number,
          ),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(and(paidTicket, gte(tickets.createdAt, start), mine))
      .groupBy(tickets.eventId),
    db
      .select({
        id: events.id,
        title: events.title,
        channelId: events.channelId,
        startsAt: events.startsAt,
      })
      .from(events)
      .where(mine),
  ]);

  const ppv = new Map(ppvRows.map((r) => [r.eventId, r]));
  const bilhetes = new Map(ticketRows.map((r) => [r.eventId, r]));

  const rows = eventRows
    .map((e) => {
      const p = ppv.get(e.id);
      const b = bilhetes.get(e.id);
      return {
        eventId: e.id,
        title: e.title,
        channelId: e.channelId,
        startsAt: e.startsAt,
        ppvBuyers: p?.buyers ?? 0,
        ppvCents: p?.cents ?? 0,
        ticketsSold: b?.sold ?? 0,
        ticketCents: b?.cents ?? 0,
        commissionCents: (p?.feeCents ?? 0) + (b?.feeCents ?? 0),
      };
    })
    // Um evento que não vendeu nada no período não tem nada para mostrar — só
    // empurrava para fora do gráfico os que venderam. Mesma regra de
    // `getPlatformEconomics`.
    .filter((r) => r.ppvBuyers > 0 || r.ticketsSold > 0)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return { commissionPct: pct, rows };
}

// ── Espectadores em simultâneo ──────────────────────────────────────────────

/*
 * ============================================================================
 *  A CURVA DO PICO — e porque é que ela é AMOSTRADA, e não exata
 * ============================================================================
 *
 * Contar quantas pessoas estavam a ver AO MESMO TEMPO é contar sobreposições de
 * intervalos. Há duas maneiras de o fazer, e escolher errado dá dois números
 * diferentes para a mesma pergunta no mesmo ecrã:
 *
 *   VARRIMENTO (+1 no início, −1 no fim, máximo da soma corrida) — exato, mas
 *   só dá o PICO. Não dá curva nenhuma para desenhar.
 *
 *   AMOSTRAGEM (contar sessões vivas em instantes igualmente espaçados) — dá a
 *   curva, e o pico é o máximo dela.
 *
 * Usa-se a AMOSTRAGEM para as duas coisas, e é uma decisão deliberada: com o
 * varrimento a dar o pico e a amostragem a dar a curva, o número grande no topo
 * do cartão podia dizer 14 enquanto a linha por baixo nunca passava de 12 — e
 * quem lê não tem como saber qual está certo. Um só cálculo garante que o
 * cartão e a curva NUNCA se desmentem.
 *
 * O que se perde diz-se no ecrã: um pico mais curto do que o intervalo de
 * amostragem pode passar entre duas amostras. Com o passo escolhido abaixo
 * (nunca mais de 5 min, e 30 s em eventos curtos) e um heartbeat de 20 s, uma
 * sessão só desaparece do gráfico se durar menos do que o passo — e uma sessão
 * dessas também não pesa na fatura da Cloudflare.
 */

/** Alvo de pontos na curva. Acima disto o gráfico vira ruído e o payload cresce. */
const CONCURRENCY_POINTS = 120;

/** Passos possíveis, em segundos. O primeiro que couber no alvo é o escolhido. */
const CONCURRENCY_STEPS = [30, 60, 120, 300, 600, 1800, 3600] as const;

export type ConcurrencyPoint = { at: Date; viewers: number };

export type EventConcurrency = {
  eventId: string;
  /** Vazio quando o evento não tem uma única sessão — ver o estado vazio. */
  points: ConcurrencyPoint[];
  /** O máximo da curva. Igual a `max(points.viewers)`, por construção. */
  peak: number;
  /** Distância entre amostras, em segundos — o ecrã tem de a poder confessar. */
  stepSeconds: number;
  sessions: number;
};

/**
 * A curva de espectadores em simultâneo de UM evento.
 *
 * Sem âmbito, como `getEventSales` e `countActiveViewers`: quem chama já
 * decidiu de que evento se fala. Nesta dashboard, quem decide é
 * `listEventsWithConcurrency`, que já corre com âmbito.
 */
export async function getEventConcurrency(eventId: string): Promise<EventConcurrency> {
  /*
   * ⚠️  AS DATAS SAEM DAQUI COMO TEXTO, E ISSO NÃO É UM CAPRICHO.
   *
   * Um campo `sql<Date>` num `select` NÃO passa pelo conversor do drizzle — só
   * as colunas mapeadas passam. O que sobra é o parser do driver, e o
   * postgres.js lê um `timestamp` (sem fuso) no fuso do PROCESSO. Como as
   * nossas colunas guardam hora UTC e a máquina corre em Lisboa, cada ida e
   * volta por um `Date` roubava uma hora — duas, na ida e na volta. Medido: a
   * curva começava às 19:00 quando a primeira sessão tinha aberto às 21:00.
   *
   * `to_char` com o formato escrito à mão tira o driver da equação: o que
   * atravessa a fronteira é uma cadeia sem ambiguidade nenhuma. O formato com
   * espaço serve para voltar a entrar no SQL; o ISO com "Z" é o que o
   * `new Date()` do JavaScript lê como UTC, sem olhar ao fuso da máquina.
   */
  const [janela] = await db
    .select({
      inicioSql: sql<
        string | null
      >`to_char(min(${playbackSessions.startedAt}), 'YYYY-MM-DD HH24:MI:SS')`,
      fimSql: sql<string | null>`to_char(max(${sessionEndsAt}), 'YYYY-MM-DD HH24:MI:SS')`,
      spanSeconds:
        sql<number>`coalesce(extract(epoch from (max(${sessionEndsAt}) - min(${playbackSessions.startedAt}))), 0)`.mapWith(
          Number,
        ),
      sessions: count(),
    })
    .from(playbackSessions)
    .where(eq(playbackSessions.eventId, eventId));

  const inicio = janela?.inicioSql ?? null;
  const fim = janela?.fimSql ?? null;
  const sessions = janela?.sessions ?? 0;

  if (!inicio || !fim || sessions === 0) {
    return { eventId, points: [], peak: 0, stepSeconds: CONCURRENCY_STEPS[0], sessions: 0 };
  }

  const spanSeconds = Math.max(1, janela?.spanSeconds ?? 1);
  const stepSeconds =
    CONCURRENCY_STEPS.find((passo) => spanSeconds / passo <= CONCURRENCY_POINTS) ??
    CONCURRENCY_STEPS[CONCURRENCY_STEPS.length - 1];

  /*
   * `generate_series` gera os instantes de amostragem e o `left join` conta as
   * sessões VIVAS em cada um. É `left`, e não `inner`, para um instante sem
   * ninguém a ver aparecer como zero em vez de desaparecer do eixo — um vale
   * apagado transformava duas subidas separadas numa meseta que nunca houve.
   *
   * A condição é a de um intervalo fechado: começou antes (ou em) `t` e ainda
   * não tinha acabado em `t`.
   *
   * As pontas entram como o TEXTO que saiu da query da janela — nunca por um
   * `Date` pelo meio, pela razão explicada acima. O cast é para `timestamp`
   * (sem fuso) porque a coluna também o é e guarda hora UTC; um `timestamptz`
   * reinterpretava tudo no fuso da sessão e deslocava a curva uma hora no verão.
   */
  const pontos = await db.execute<{ at: string; viewers: number }>(sql`
    select
      to_char(amostra.at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at,
      count(sessao.id)::int as viewers
    from generate_series(
      ${inicio}::timestamp,
      ${fim}::timestamp,
      ${`${stepSeconds} seconds`}::interval
    ) as amostra(at)
    left join ${playbackSessions} as sessao
      on sessao.event_id = ${eventId}
     and sessao.started_at <= amostra.at
     and least(
           sessao.last_heartbeat_at,
           coalesce(sessao.revoked_at, sessao.last_heartbeat_at)
         ) >= amostra.at
    group by amostra.at
    order by amostra.at
  `);

  const points = [...pontos].map((p) => ({ at: new Date(p.at), viewers: Number(p.viewers) }));
  return {
    eventId,
    points,
    peak: points.reduce((max, p) => Math.max(max, p.viewers), 0),
    stepSeconds,
    sessions,
  };
}

export type EventWithSessions = {
  eventId: string;
  title: string;
  channelId: string;
  startsAt: Date;
  sessions: number;
};

/** Os eventos que têm sessões de visionamento — os únicos com curva para desenhar. */
export async function listEventsWithConcurrency(scope: ChannelScope): Promise<EventWithSessions[]> {
  return db
    .select({
      eventId: events.id,
      title: events.title,
      channelId: events.channelId,
      startsAt: events.startsAt,
      sessions: count(playbackSessions.id),
    })
    .from(events)
    .innerJoin(playbackSessions, eq(playbackSessions.eventId, events.id))
    .where(inChannelScope(scope))
    .groupBy(events.id)
    .orderBy(desc(events.startsAt));
}

// ── Registos novos e conversão ──────────────────────────────────────────────

export type SignupBucket = {
  bucket: string;
  signups: number;
  /** Dos que se registaram neste balde, quantos já compraram alguma coisa. */
  converted: number;
};

export type SignupSeries = {
  unit: BucketUnit;
  buckets: string[];
  rows: SignupBucket[];
  totals: { signups: number; converted: number };
};

/**
 * Registos novos por período e quantos deles compraram — **conversão por coorte**.
 *
 * ⚠️  SEM ÂMBITO, e é a segunda função deste ficheiro assim (a outra é
 * `getPlatformTotals`). Só pode ser chamada atrás de `isPlatformAdmin`.
 *
 * Não leva âmbito porque não PODE: uma conta não nasce dentro de um canal. O
 * registo é da plataforma, e atribuí-lo ao canal do primeiro evento que a
 * pessoa comprou era inventar uma origem que não está guardada em lado nenhum.
 * Dar um âmbito falso a esta query era pior do que dizer que ela é global.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUÊ COORTE, E NÃO "COMPRAS A DIVIDIR POR REGISTOS"
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O rácio fácil — compradores do mês ÷ registos do mês — mistura gente: quem
 * comprou este mês pode ter-se registado há seis. Em meses de campanha o
 * número passa de 100 %, o que só mostra que a conta não quer dizer nada.
 *
 * Aqui a pergunta é outra e responde-se: **das pessoas que se registaram nesta
 * semana, quantas chegaram a comprar?** Cada conta é contada no balde em que
 * nasceu, uma só vez, e "comprou" é para sempre — por isso as coortes recentes
 * aparecem naturalmente mais baixas (ainda não tiveram tempo), e o ecrã diz-o.
 */
export async function getSignupsByPeriod(
  period: PeriodKey,
  now = new Date(),
): Promise<SignupSeries> {
  const { unit } = PERIODS[period];
  const start = periodStart(period, now);
  const bucket = bucketOf(user.createdAt, unit);

  /*
   * As colunas vão INTERPOLADAS (`${user.id}`), nunca escritas à mão dentro do
   * texto. O drizzle rende um fragmento cru sem qualificar a tabela, e um `id`
   * escrito à mão aqui dentro era lido como o `id` da tabela de dentro — o bug
   * medido em `listChannelsInScope`, que devolvia zero em tudo sem dar erro.
   */
  const jaComprou = sql`(
    exists (
      select 1 from ${entitlements}
       where ${entitlements.userId} = ${user.id}
         and ${entitlements.status} = 'active'
    ) or exists (
      select 1 from ${tickets}
       where ${tickets.userId} = ${user.id}
         and ${tickets.status} in ('issued', 'used')
    )
  )`;

  const rows = await db
    .select({
      bucket,
      signups: count(),
      converted: sql<number>`count(*) filter (where ${jaComprou})`.mapWith(Number),
    })
    .from(user)
    .where(gte(user.createdAt, start))
    .groupBy(bucket)
    .orderBy(bucket);

  return {
    unit,
    buckets: bucketKeysBetween(start, now, unit),
    rows,
    totals: rows.reduce(
      (acc, r) => ({ signups: acc.signups + r.signups, converted: acc.converted + r.converted }),
      { signups: 0, converted: 0 },
    ),
  };
}

// ── Saúde ───────────────────────────────────────────────────────────────────

/**
 * Sessões cortadas por motivo.
 *
 * ⚠️  CONTA `revoked_at` E NUNCA `superseded_at`, e a diferença é toda.
 * Até à Frente N, recarregar a página do MESMO browser contava como sessão
 * bloqueada: 7 "bloqueios" no teste real eram uma pessoa só, num browser só, a
 * fugir do token que expirava. A métrica que existia para detetar partilha de
 * conta estava a medir um bug nosso.
 *
 * Agora a reconexão do mesmo dispositivo é `superseded_at` — silenciosa, e fora
 * desta conta. `revoked_at` ficou a querer dizer o que sempre devia:
 *
 *   other_device — outro dispositivo na mesma conta. É ISTO a partilha suspeita.
 *   watermark    — a marca de água foi mexida. É adulteração, não partilha.
 *   no_access    — o acesso deixou de ser válido. Não é nenhuma das outras.
 *
 * Somar os três num número só apagava a única distinção que interessa a quem
 * quer decidir se bane uma conta. Por isso saem separados.
 */
export type BlockedByReason = { reason: string; total: number };

export type PlatformHealth = {
  blocked: BlockedByReason[];
  blockedTotal: number;
  /** Sessões substituídas em silêncio — o contra-número, para o zero se ler. */
  superseded: number;
};

export async function getPlatformHealth(
  scope: ChannelScope,
  period: PeriodKey,
  now = new Date(),
): Promise<PlatformHealth> {
  const start = periodStart(period, now);
  const mine = inChannelScope(scope);

  const [blockedRows, [supersededRow]] = await Promise.all([
    db
      .select({
        reason: sql<string>`coalesce(${playbackSessions.revokedReason}, 'desconhecido')`,
        total: count(),
      })
      .from(playbackSessions)
      // O join a `events` é o âmbito: `playback_sessions` não tem canal.
      .innerJoin(events, eq(playbackSessions.eventId, events.id))
      .where(
        and(isNotNull(playbackSessions.revokedAt), gte(playbackSessions.revokedAt, start), mine),
      )
      .groupBy(playbackSessions.revokedReason),
    db
      .select({ n: count() })
      .from(playbackSessions)
      .innerJoin(events, eq(playbackSessions.eventId, events.id))
      .where(
        and(
          isNotNull(playbackSessions.supersededAt),
          gte(playbackSessions.supersededAt, start),
          mine,
        ),
      ),
  ]);

  const blocked = [...blockedRows].sort((a, b) => b.total - a.total);
  return {
    blocked,
    blockedTotal: blocked.reduce((n, r) => n + r.total, 0),
    superseded: supersededRow?.n ?? 0,
  };
}
