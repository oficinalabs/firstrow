"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { events } from "@/db/schema";
import { canOperateEvents, getCurrentUser } from "@/server/authz";

const inputSchema = z.object({
  eventId: z.string().min(1),
  status: z.enum(["draft", "live", "ended"]),
});

// Muda o estado da transmissão (events.status). Gate próprio: server actions
// são endpoints — não herdam a proteção do layout. Pôr no ar e terminar é
// operar, não gerir: a equipa da liga também o faz.
export async function setEventStatus(input: unknown): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!canOperateEvents(user)) return { error: "Sem permissão para mudar o estado." };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido — recarrega a página." };

  const { eventId, status } = parsed.data;
  const updated = await db
    .update(events)
    .set({ status, updatedAt: new Date() })
    .where(eq(events.id, eventId))
    .returning({ id: events.id });
  if (updated.length === 0) return { error: "Este evento já não existe." };

  revalidatePath("/admin");
  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/eventos/${eventId}/transmissao`);
  return {};
}
