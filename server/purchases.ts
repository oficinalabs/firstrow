import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, events, tickets } from "@/db/schema";

export type Purchase = {
  entitlementId: string;
  eventId: string;
  eventTitle: string;
  startsAt: Date;
  priceCents: number;
  boughtAt: Date;
};

/**
 * Compras do utilizador na Fase 0 = entitlements ativos (PPV), com o evento.
 * Bilhetes físicos chegam com a Frente D. Mais recentes primeiro.
 */
export async function listUserPurchases(userId: string): Promise<Purchase[]> {
  return db
    .select({
      entitlementId: entitlements.id,
      eventId: events.id,
      eventTitle: events.title,
      startsAt: events.startsAt,
      priceCents: events.priceCents,
      boughtAt: entitlements.createdAt,
    })
    .from(entitlements)
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(and(eq(entitlements.userId, userId), eq(entitlements.status, "active")))
    .orderBy(desc(entitlements.createdAt));
}

/**
 * Guarda a referência da Eupago na compra pendente, logo a seguir a criá-la.
 *
 * Antes só se guardava quando o webhook chegava — e por isso, quando o webhook
 * NÃO chegava, ficávamos sem nada por onde procurar a transação. Foi exatamente
 * o que aconteceu no primeiro teste em sandbox: pagamento criado do lado da
 * Eupago, nada do nosso lado a apontar-lhe.
 *
 * Guardar à cabeça serve duas coisas: dá com que reconciliar uma compra cujo
 * webhook se perdeu, e dá o número que se dita ao suporte da Eupago. O webhook
 * escreve por cima com o mesmo valor — é a mesma referência.
 *
 * Nunca deixa a compra cair por causa disto: sem referência a compra continua
 * de pé (o `identifier` chega para o webhook a activar), só fica mais difícil
 * de investigar. Falhar aqui seria pior do que o problema que resolve.
 */
export async function recordChargeReference(
  kind: "entitlement" | "ticket",
  id: string,
  reference: string | null,
): Promise<void> {
  if (!reference) return;
  const table = kind === "entitlement" ? entitlements : tickets;
  try {
    await db.update(table).set({ providerRef: reference }).where(eq(table.id, id));
  } catch (error) {
    console.error(`[compras] não guardei a referência ${reference} em ${kind} ${id}:`, error);
  }
}
