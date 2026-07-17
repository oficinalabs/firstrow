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
import { entitlements, events, playbackSessions } from "@/db/schema";

/*
 * Queries agregadas do backoffice (Frente E). Dinheiro sempre em cêntimos —
 * formatar só na UI via lib/format.ts. Timestamps guardados como hora UTC;
 * fronteiras de mês/dia calculadas em Europe/Lisbon.
 *
 * TODO(frente-d): a tabela `tickets` ainda não existe no schema. Quando o
 * merge da Frente D chegar, juntar bilhetes à receita do mês, aos pagamentos
 * recentes, à lista de eventos e ao extrato de ganhos.
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const { start, end, key } = monthBounds(now);

  const [monthRow] = await db
    .select({ revenueCents: grossCents, purchases: count() })
    .from(entitlements)
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(
      and(activeEntitlement, gte(entitlements.createdAt, start), lt(entitlements.createdAt, end)),
    );

  const [buyersRow] = await db
    .select({ buyers: countDistinct(entitlements.userId) })
    .from(entitlements)
    .where(activeEntitlement);

  // Próximo evento: um live em curso ganha; senão, o rascunho mais próximo.
  const [liveEvent] = await db
    .select()
    .from(events)
    .where(eq(events.status, "live"))
    .orderBy(desc(events.startsAt))
    .limit(1);
  const [upcoming] = liveEvent
    ? [liveEvent]
    : await db
        .select()
        .from(events)
        .where(and(eq(events.status, "draft"), gte(events.startsAt, now)))
        .orderBy(asc(events.startsAt))
        .limit(1);

  const [eventsRow] = await db.select({ n: count() }).from(events);

  return {
    monthLabel: monthLabel(key),
    monthRevenueCents: monthRow?.revenueCents ?? 0,
    monthPurchases: monthRow?.purchases ?? 0,
    buyersTotal: buyersRow?.buyers ?? 0,
    nextEvent: upcoming ?? null,
    hasEvents: (eventsRow?.n ?? 0) > 0,
  };
}

export async function listRecentPayments(limit = 6): Promise<RecentPayment[]> {
  // TODO(frente-d): juntar (UNION) as compras de bilhetes físicos.
  const rows = await db
    .select({
      id: entitlements.id,
      createdAt: entitlements.createdAt,
      buyerName: user.name,
      eventTitle: events.title,
      amountCents: events.priceCents,
    })
    .from(entitlements)
    .innerJoin(user, eq(entitlements.userId, user.id))
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(activeEntitlement)
    .orderBy(desc(entitlements.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, kind: "ppv" as const }));
}

export async function listEventsWithSales(): Promise<EventWithSales[]> {
  const rows = await db
    .select({ event: events, buyers: count(entitlements.id) })
    .from(events)
    .leftJoin(entitlements, and(eq(entitlements.eventId, events.id), activeEntitlement))
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

export async function listBuyers(): Promise<BuyerRow[]> {
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
    .where(activeEntitlement)
    .groupBy(user.id, user.name, user.email)
    .orderBy(desc(lastPurchaseAt));
  return rows.map((r) => ({ ...r, lastPurchaseAt: r.lastPurchaseAt ?? new Date(0) }));
}

export async function getMonthlyStatement(): Promise<{
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
    .where(activeEntitlement)
    .groupBy(monthKey)
    .orderBy(desc(monthKey));

  return {
    commissionPct: pct,
    rows: rows.map((r) => ({
      ...r,
      monthLabel: monthLabel(r.monthKey),
      netCents: r.grossCents - r.firstrowFeeCents - r.eupagoFeeCents,
    })),
  };
}

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
