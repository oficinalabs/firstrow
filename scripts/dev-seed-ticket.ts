/*
 * Seed de desenvolvimento: simula o ciclo de bilhetes sem passar pela Eupago.
 * Cria 2 eventos com bilhetes + 3 bilhetes para o utilizador dado:
 *   T1 issued no evento futuro (validar à porta → VÁLIDO, 2ª vez → JÁ USADO)
 *   T2 used no evento passado (histórico em /bilhetes)
 *   T3 issued no evento passado (à porta do futuro → OUTRO EVENTO)
 *
 * Uso: pnpm dlx tsx scripts/dev-seed-ticket.ts <email-do-utilizador>
 * (o utilizador tem de existir — regista-te primeiro na app)
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { events, tickets } from "@/db/schema";
import { issueTicket, shortCode } from "@/server/tickets";

async function findOrCreateEvent(input: {
  title: string;
  startsAt: Date;
  priceCents: number;
  ticketPriceCents: number;
  ticketCapacity: number;
}) {
  const existing = await db.select().from(events).where(eq(events.title, input.title)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(events)
    .values({ id: crypto.randomUUID(), status: "draft", ...input })
    .returning();
  return inserted[0];
}

async function seedTicket(input: {
  eventId: string;
  userId: string;
  priceCents: number;
  used?: Date;
}) {
  const id = `tkt_${crypto.randomUUID()}`;
  await db.insert(tickets).values({
    id,
    eventId: input.eventId,
    userId: input.userId,
    status: "pending",
    priceCents: input.priceCents,
  });
  await issueTicket(id, "seed-dev");
  if (input.used) {
    await db.update(tickets).set({ status: "used", usedAt: input.used }).where(eq(tickets.id, id));
  }
  const rows = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return rows[0];
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: pnpm dlx tsx scripts/dev-seed-ticket.ts <email-do-utilizador>");
    process.exit(1);
  }

  const buyers = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const buyer = buyers[0];
  if (!buyer) {
    console.error(`Utilizador ${email} não existe — regista-te primeiro na app.`);
    process.exit(1);
  }

  const futuro = await findOrCreateEvent({
    title: "SB Clash #14 — Final de Verão",
    startsAt: new Date("2026-07-26T20:00:00Z"), // 21:00 Lisboa
    priceCents: 750,
    ticketPriceCents: 1200,
    ticketCapacity: 250,
  });

  const passado = await findOrCreateEvent({
    title: "SB Clash #13 — Meias-finais",
    startsAt: new Date("2026-06-28T19:00:00Z"), // 20:00 Lisboa
    priceCents: 750,
    ticketPriceCents: 1000,
    ticketCapacity: 250,
  });

  const t1 = await seedTicket({ eventId: futuro.id, userId: buyer.id, priceCents: 1200 });
  const t2 = await seedTicket({
    eventId: passado.id,
    userId: buyer.id,
    priceCents: 1000,
    used: new Date("2026-06-28T19:52:00Z"), // 20:52 Lisboa
  });
  const t3 = await seedTicket({ eventId: passado.id, userId: buyer.id, priceCents: 1000 });

  console.log("--- seed ok ---");
  console.log(`evento futuro:  ${futuro.id}  (${futuro.title})`);
  console.log(`evento passado: ${passado.id}  (${passado.title})`);
  console.log(
    `T1 issued  ${t1.id}  code=${t1.qrToken ? shortCode(t1.qrToken) : "?"}  qr=${t1.qrToken}`,
  );
  console.log(`T2 used    ${t2.id}`);
  console.log(
    `T3 issued  ${t3.id}  code=${t3.qrToken ? shortCode(t3.qrToken) : "?"}  (outro evento)`,
  );
  console.log(`scanner:   /admin/scanner?evento=${futuro.id}`);
  console.log(`bo:        /admin/eventos/${futuro.id}/bilhetes`);

  process.exit(0);
}

void main();
