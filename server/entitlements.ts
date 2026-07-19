import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entitlements } from "@/db/schema";
import { newId } from "@/lib/ids";
import { buildReceipt, type ReceiptData } from "@/server/receipts";

export async function hasActiveEntitlement(userId: string, eventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.eventId, eventId),
        eq(entitlements.status, "active"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * O id da compra pendente desta pessoa neste evento, se existir.
 *
 * Serve a reconciliação de quem está à espera: o ecrã de compra sabe o evento,
 * não sabe o id da compra. O índice único (utilizador, evento) garante que a
 * resposta é uma só.
 */
export async function pendingEntitlementId(
  userId: string,
  eventId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.eventId, eventId),
        eq(entitlements.status, "pending"),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

// Cria (ou devolve) um entitlement pendente. O id serve de `identifier` na Eupago.
export async function createPendingEntitlement(userId: string, eventId: string) {
  await db
    .insert(entitlements)
    .values({ id: newId(), userId, eventId, status: "pending" })
    .onConflictDoNothing({ target: [entitlements.userId, entitlements.eventId] });

  const rows = await db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.eventId, eventId)))
    .limit(1);
  return rows[0];
}

export async function activateEntitlement(
  entitlementId: string,
  providerRef: string,
): Promise<ReceiptData | null> {
  // Idempotente: só transita pending→active uma vez (os webhooks repetem-se);
  // devolve os dados do recibo só nessa primeira vez, para o email sair 1x.
  const [row] = await db
    .update(entitlements)
    .set({ status: "active", providerRef })
    .where(and(eq(entitlements.id, entitlementId), eq(entitlements.status, "pending")))
    .returning({ userId: entitlements.userId, eventId: entitlements.eventId });
  if (!row) return null;
  return buildReceipt(row.userId, row.eventId);
}
