import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entitlements } from "@/db/schema";
import { newId } from "@/lib/ids";

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

export async function activateEntitlement(entitlementId: string, providerRef: string) {
  await db
    .update(entitlements)
    .set({ status: "active", providerRef })
    .where(eq(entitlements.id, entitlementId));
}
