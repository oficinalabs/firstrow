import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, events } from "@/db/schema";

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
