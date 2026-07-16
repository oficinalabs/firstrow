import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { createLiveInput } from "@/lib/cloudflare";
import { newId } from "@/lib/ids";

export type NewEventInput = {
  title: string;
  startsAt: Date;
  priceCents: number;
};

// Cria o evento e provisiona o live input na Cloudflare (para o OBS).
export async function createEvent(input: NewEventInput) {
  const liveInput = await createLiveInput(input.title);
  const id = newId();
  await db.insert(events).values({
    id,
    title: input.title,
    startsAt: input.startsAt,
    priceCents: input.priceCents,
    status: "draft",
    cfLiveInputId: liveInput.uid,
  });
  return { id, liveInput };
}

export async function getEvent(id: string) {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listEvents() {
  return db.select().from(events).orderBy(desc(events.startsAt));
}
