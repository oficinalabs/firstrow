import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  max,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { channels, entitlements, events, playbackSessions } from "@/db/schema";
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
 * TODO(frente-d): juntar bilhetes à receita do mês, aos pagamentos recentes,
 * à lista de eventos e ao extrato de ganhos.
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
  grossCents: number;
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

const grossCents = sql<number>`coalesce(sum(${events.priceCents}), 0)`.mapWith(Number);

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

export async function listEventsWithSales(scope: ChannelScope): Promise<EventWithSales[]> {
  const rows = await db
    .select({ event: events, buyers: count(entitlements.id) })
    .from(events)
    .leftJoin(entitlements, and(eq(entitlements.eventId, events.id), activeEntitlement))
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
  const monthKey = sql<string>`to_char(${entitlements.createdAt} at time zone 'UTC' at time zone 'Europe/Lisbon', 'YYYY-MM')`;

  // Taxas por transação: FirstRow espelha lib/split.ts (round(preço × pct%));
  // Eupago é estimativa — 0,07 € + 0,7% por transação MB WAY.
  const rows = await db
    .select({
      monthKey,
      channelId: events.channelId,
      grossCents,
      purchases: count(),
      firstrowFeeCents:
        sql<number>`coalesce(sum(round(${events.priceCents} * ${pct}::numeric / 100)), 0)`.mapWith(
          Number,
        ),
      eupagoFeeCents:
        sql<number>`coalesce(sum(7 + round(${events.priceCents} * 0.007)), 0)`.mapWith(Number),
    })
    .from(entitlements)
    .innerJoin(events, eq(entitlements.eventId, events.id))
    // O join a `channels` é só para a ordem: dentro do mesmo mês os canais saem
    // pela ordem que valem no resto da app (o mais antigo à cabeça), e não pela
    // ordem arbitrária dos ids.
    .innerJoin(channels, eq(events.channelId, channels.id))
    .where(and(activeEntitlement, inChannelScope(scope)))
    .groupBy(monthKey, events.channelId, channels.createdAt)
    .orderBy(desc(monthKey), asc(channels.createdAt));

  return {
    commissionPct: pct,
    rows: rows.map((r) => ({
      ...r,
      monthLabel: monthLabel(r.monthKey),
      netCents: r.grossCents - r.firstrowFeeCents - r.eupagoFeeCents,
    })),
  };
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
 */
export async function getDeliveryByEvent(
  scope: ChannelScope,
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
    .where(inChannelScope(scope))
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
 */
export async function getPlatformEconomics(scope: ChannelScope): Promise<PlatformEconomics> {
  const commissionPct = platformCommissionPct();
  // A taxa é lida AQUI, do lado do servidor, e entregue pura ao modelo — ver a
  // nota sobre `NEXT_PUBLIC_` no topo de `lib/video-costs.ts`.
  const usdToEur = resolveUsdToEur(process.env.USD_TO_EUR_RATE);

  const [eventRows, delivery] = await Promise.all([
    listEventsWithSales(scope),
    getDeliveryByEvent(scope),
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

  return { commissionPct, usdToEur, rows, totals: totalEconomics(rows) };
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
