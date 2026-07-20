"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { events } from "@/db/schema";
import { permitEventOperation } from "@/server/event-access";
import { linkEventRecording } from "@/server/recordings";

const inputSchema = z.object({
  eventId: z.string().min(1),
  status: z.enum(["draft", "live", "ended"]),
});

// Muda o estado da transmissão (events.status). Gate próprio: server actions
// são endpoints — não herdam a proteção do layout. Pôr no ar e terminar é
// operar, não gerir: a equipa da liga também o faz.
//
// O `eventId` é lido ANTES do gate porque é dele que sai o canal — mas nada se
// escreve antes de `permitEventOperation` dizer que sim. Pôr no ar a live de
// outra liga era o pior estrago possível a partir daqui.
export async function setEventStatus(input: unknown): Promise<{ error?: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido — recarrega a página." };

  const { eventId, status } = parsed.data;

  const permit = await permitEventOperation(eventId);
  if (!permit.ok) return { error: permit.error };
  const updated = await db
    .update(events)
    .set({ status, updatedAt: new Date() })
    .where(eq(events.id, eventId))
    .returning({ id: events.id });
  if (updated.length === 0) return { error: "Este evento já não existe." };

  /*
   * Terminar é o momento de ir buscar a gravação. Quase sempre é cedo demais —
   * a Cloudflare ainda a está a processar — e é por isso que a página de
   * transmissão volta a tentar sozinha. Aqui é só a primeira oportunidade.
   *
   * Nunca falha a ação por causa disto: o estado do evento é o que a pessoa
   * pediu, e uma gravação por ligar resolve-se na próxima visita.
   */
  if (status === "ended") {
    await linkEventRecording(eventId).catch((error) => {
      console.error(`[gravacoes] ao terminar ${eventId}:`, error);
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/eventos/${eventId}/transmissao`);
  return {};
}
