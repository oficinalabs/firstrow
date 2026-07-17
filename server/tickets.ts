import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { events, tickets } from "@/db/schema";
import { buildReceipt, type ReceiptData } from "@/server/receipts";

// Uma compra pendente segura lugar durante este intervalo (o MB WAY expira aos
// 5 min); depois deixa de contar para a lotação e o retry reutiliza-a.
const HOLD_MINUTES = 15;

// O prefixo "tkt_" no id permite ao webhook Eupago distinguir bilhetes de
// entitlements (uuid puro) pelo `identifier`.
function newTicketId(): string {
  return `tkt_${crypto.randomUUID()}`;
}

// Token do QR: opaco, 192 bits — impossível de adivinhar ou enumerar.
function newQrToken(): string {
  return `frt_${randomBytes(24).toString("base64url")}`;
}

// Código curto impresso sob o QR ("FR-7K2M-99") para ditar/escrever à porta.
// Derivado do token (sem coluna própria); alfabeto sem 0/O/1/I para não haver
// confusões ao ouvido ou à vista.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function shortCode(qrToken: string): string {
  const digest = createHash("sha256").update(qrToken).digest();
  let raw = "";
  for (let i = 0; i < 6; i++) {
    raw += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
  }
  return `FR-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function holdCutoff(): Date {
  return new Date(Date.now() - HOLD_MINUTES * 60_000);
}

// Conta para a lotação: emitidos, usados e pendentes recentes (compra a decorrer).
function countsTowardCapacity() {
  return or(
    inArray(tickets.status, ["issued", "used"]),
    and(eq(tickets.status, "pending"), gt(tickets.createdAt, holdCutoff())),
  );
}

export type CreatePendingTicketResult =
  | { ok: true; ticket: typeof tickets.$inferSelect }
  | { ok: false; reason: "sem_bilhetes" | "esgotado" };

// Cria (ou reutiliza) o bilhete pendente. O id serve de `identifier` na Eupago.
export async function createPendingTicket(
  userId: string,
  eventId: string,
): Promise<CreatePendingTicketResult> {
  const eventRows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const event = eventRows[0];
  if (!event || event.ticketPriceCents == null) return { ok: false, reason: "sem_bilhetes" };

  // Retry da mesma pessoa reutiliza o pendente recente — não acumula lugares presos.
  const existing = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.userId, userId),
        eq(tickets.eventId, eventId),
        eq(tickets.status, "pending"),
        gt(tickets.createdAt, holdCutoff()),
      ),
    )
    .limit(1);
  if (existing[0]) return { ok: true, ticket: existing[0] };

  if (event.ticketCapacity != null) {
    const counted = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.eventId, eventId), countsTowardCapacity()));
    if ((counted[0]?.count ?? 0) >= event.ticketCapacity) return { ok: false, reason: "esgotado" };
  }

  const inserted = await db
    .insert(tickets)
    .values({
      id: newTicketId(),
      eventId,
      userId,
      status: "pending",
      priceCents: event.ticketPriceCents,
    })
    .returning();
  return { ok: true, ticket: inserted[0] };
}

// Pagamento confirmado → emite o QR. Idempotente: os webhooks repetem-se e o
// token nunca é regenerado (só transita a partir de "pending").
export async function issueTicket(
  ticketId: string,
  providerRef: string,
): Promise<ReceiptData | null> {
  const [row] = await db
    .update(tickets)
    .set({ status: "issued", qrToken: newQrToken(), providerRef, updatedAt: new Date() })
    .where(and(eq(tickets.id, ticketId), eq(tickets.status, "pending")))
    .returning({
      userId: tickets.userId,
      eventId: tickets.eventId,
      priceCents: tickets.priceCents,
    });
  if (!row) return null;
  return buildReceipt(row.userId, row.eventId, row.priceCents);
}

export async function refundTicket(ticketId: string): Promise<void> {
  await db
    .update(tickets)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(eq(tickets.id, ticketId));
}

export async function getTicketStatus(ticketId: string, userId: string): Promise<string | null> {
  const rows = await db
    .select({ status: tickets.status })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.userId, userId)))
    .limit(1);
  return rows[0]?.status ?? null;
}

export type ValidateTicketResult =
  | { resultado: "valido"; codigo: string; nome: string; usedAt: Date }
  | { resultado: "ja_usado"; codigo: string; nome: string; usedAt: Date | null }
  | {
      resultado: "evento_errado";
      codigo: string;
      nome: string;
      eventoTitulo: string;
      eventoStartsAt: Date;
    }
  | { resultado: "invalido" };

// Aceita o token completo (leitura da câmara) ou o código curto escrito à mão.
async function resolveQrToken(code: string, eventId: string): Promise<string | null> {
  const raw = code.trim();
  if (raw.startsWith("frt_")) return raw;

  let norm = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (norm.length === 8 && norm.startsWith("FR")) norm = norm.slice(2);
  if (norm.length !== 6) return null;
  const formatted = `FR-${norm.slice(0, 4)}-${norm.slice(4)}`;

  // Primeiro os bilhetes da porta; depois global (apanha "outro evento").
  // Volume Fase 0 (centenas por evento) torna o varrimento aceitável.
  const local = await db
    .select({ qrToken: tickets.qrToken })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), isNotNull(tickets.qrToken)));
  const hit = local.find((t) => t.qrToken && shortCode(t.qrToken) === formatted);
  if (hit?.qrToken) return hit.qrToken;

  const global = await db
    .select({ qrToken: tickets.qrToken })
    .from(tickets)
    .where(isNotNull(tickets.qrToken));
  const globalHit = global.find((t) => t.qrToken && shortCode(t.qrToken) === formatted);
  return globalHit?.qrToken ?? null;
}

// Validação à porta. O UPDATE condicional é atómico — dois scanners a ler o
// mesmo QR ao mesmo tempo dão exatamente 1 "valido" e 1 "ja_usado".
export async function validateTicket(code: string, eventId: string): Promise<ValidateTicketResult> {
  const qrToken = await resolveQrToken(code, eventId);
  if (!qrToken) return { resultado: "invalido" };

  const now = new Date();
  const entered = await db
    .update(tickets)
    .set({ status: "used", usedAt: now, updatedAt: now })
    .where(
      and(eq(tickets.qrToken, qrToken), eq(tickets.eventId, eventId), eq(tickets.status, "issued")),
    )
    .returning({ userId: tickets.userId });

  if (entered[0]) {
    const buyer = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, entered[0].userId))
      .limit(1);
    return {
      resultado: "valido",
      codigo: shortCode(qrToken),
      nome: buyer[0]?.name ?? "",
      usedAt: now,
    };
  }

  // Não entrou — perceber porquê, com os dados que o porteiro precisa de ver.
  const rows = await db
    .select({
      eventId: tickets.eventId,
      status: tickets.status,
      usedAt: tickets.usedAt,
      nome: user.name,
      eventoTitulo: events.title,
      eventoStartsAt: events.startsAt,
    })
    .from(tickets)
    .innerJoin(user, eq(user.id, tickets.userId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .where(eq(tickets.qrToken, qrToken))
    .limit(1);
  const ticket = rows[0];
  if (!ticket) return { resultado: "invalido" };

  const codigo = shortCode(qrToken);
  if (ticket.eventId !== eventId && (ticket.status === "issued" || ticket.status === "used")) {
    return {
      resultado: "evento_errado",
      codigo,
      nome: ticket.nome,
      eventoTitulo: ticket.eventoTitulo,
      eventoStartsAt: ticket.eventoStartsAt,
    };
  }
  if (ticket.status === "used") {
    return { resultado: "ja_usado", codigo, nome: ticket.nome, usedAt: ticket.usedAt };
  }
  // pending (não pago) ou refunded — não entra.
  return { resultado: "invalido" };
}

export type UserTicket = {
  id: string;
  qrToken: string | null;
  status: string;
  usedAt: Date | null;
  priceCents: number;
  eventoTitulo: string;
  eventoStartsAt: Date;
};

// Bilhetes do utilizador: por usar primeiro (próximo evento à cabeça), usados depois.
export async function listTicketsByUser(userId: string): Promise<UserTicket[]> {
  const rows = await db
    .select({
      id: tickets.id,
      qrToken: tickets.qrToken,
      status: tickets.status,
      usedAt: tickets.usedAt,
      priceCents: tickets.priceCents,
      eventoTitulo: events.title,
      eventoStartsAt: events.startsAt,
    })
    .from(tickets)
    .innerJoin(events, eq(events.id, tickets.eventId))
    .where(and(eq(tickets.userId, userId), inArray(tickets.status, ["issued", "used"])))
    .orderBy(desc(events.startsAt));
  // Por usar primeiro, com o evento mais perto de agora no topo — à porta,
  // o bilhete desta noite (mesmo já começada) tem de ser o primeiro QR.
  const now = Date.now();
  const porUsar = rows
    .filter((t) => t.status === "issued")
    .sort(
      (a, b) =>
        Math.abs(a.eventoStartsAt.getTime() - now) - Math.abs(b.eventoStartsAt.getTime() - now),
    );
  const usados = rows.filter((t) => t.status === "used");
  return [...porUsar, ...usados];
}

export type EventTicket = {
  id: string;
  qrToken: string | null;
  status: string;
  usedAt: Date | null;
  priceCents: number;
  createdAt: Date;
  nome: string;
  email: string;
};

export async function listTicketsByEvent(eventId: string): Promise<EventTicket[]> {
  return db
    .select({
      id: tickets.id,
      qrToken: tickets.qrToken,
      status: tickets.status,
      usedAt: tickets.usedAt,
      priceCents: tickets.priceCents,
      createdAt: tickets.createdAt,
      nome: user.name,
      email: user.email,
    })
    .from(tickets)
    .innerJoin(user, eq(user.id, tickets.userId))
    .where(
      and(eq(tickets.eventId, eventId), inArray(tickets.status, ["issued", "used", "refunded"])),
    )
    .orderBy(desc(tickets.createdAt));
}

export type EventTicketStats = {
  vendidos: number;
  entraram: number;
  receitaCents: number;
};

export async function getEventTicketStats(eventId: string): Promise<EventTicketStats> {
  const rows = await db
    .select({
      vendidos: sql<number>`count(*) filter (where ${tickets.status} in ('issued', 'used'))::int`,
      entraram: sql<number>`count(*) filter (where ${tickets.status} = 'used')::int`,
      receitaCents: sql<number>`coalesce(sum(${tickets.priceCents}) filter (where ${tickets.status} in ('issued', 'used')), 0)::int`,
    })
    .from(tickets)
    .where(eq(tickets.eventId, eventId));
  return rows[0] ?? { vendidos: 0, entraram: 0, receitaCents: 0 };
}
