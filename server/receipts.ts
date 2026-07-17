import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { events } from "@/db/schema";

export type ReceiptData = {
  nome: string | null;
  emailConta: string;
  eventoTitulo: string;
  eventoData: Date;
  valorCents: number;
  eventId: string;
};

// Junta os dados do recibo (comprador + evento) de um pagamento confirmado.
// `valorCents` permite passar o preço do bilhete; se omitido usa o preço PPV do
// evento. Partilhado por entitlements e tickets (DRY) — ver webhook Eupago.
export async function buildReceipt(
  userId: string,
  eventId: string,
  valorCents?: number,
): Promise<ReceiptData | null> {
  const [u] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const [e] = await db
    .select({ title: events.title, startsAt: events.startsAt, priceCents: events.priceCents })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!u || !e) return null;

  return {
    nome: u.name,
    emailConta: u.email,
    eventoTitulo: e.title,
    eventoData: e.startsAt,
    valorCents: valorCents ?? e.priceCents,
    eventId,
  };
}
