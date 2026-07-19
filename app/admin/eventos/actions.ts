"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type EventFormState, validateEventForm } from "@/lib/event-rules";
import { formatNumber } from "@/lib/format";
import { canManageEvents, getCurrentUser } from "@/server/authz";
import { createEvent, type DeleteEventResult, deleteEvent } from "@/server/events";

/*
 * Ações de eventos do backoffice. Uma server action é um endpoint como
 * qualquer outro: valida os papéis e os dados aqui, sempre — o formulário do
 * outro lado é conveniência, não segurança.
 */

function refreshEventScreens(eventId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/eventos");
  if (eventId) revalidatePath(`/admin/eventos/${eventId}/transmissao`);
}

/**
 * Cria um evento a partir do formulário.
 *
 * Devolve sempre `values` com o que foi escrito: é assim que um erro de
 * validação deixa o formulário exatamente como o dono o tinha.
 */
export async function createEventAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const submitted = Object.fromEntries(formData);

  const user = await getCurrentUser();
  if (!canManageEvents(user)) {
    const { values } = validateEventForm(submitted);
    return { errors: {}, message: "Não tens permissão para criar eventos.", values };
  }

  const checked = validateEventForm(submitted);
  if (!checked.ok) {
    return { errors: checked.errors, message: "", values: checked.values };
  }

  let created: Awaited<ReturnType<typeof createEvent>>;
  try {
    created = await createEvent(checked.draft);
  } catch (error) {
    console.error("[eventos] criar falhou:", error);
    return {
      errors: {},
      message: "Não deu para criar o evento. Espera um momento e tenta outra vez.",
      values: checked.values,
    };
  }

  refreshEventScreens(created.id);
  // Fora do try: o redirect do Next funciona por exceção e não é um erro.
  redirect(`/admin/eventos/${created.id}/transmissao`);
}

function refusalMessage(result: Extract<DeleteEventResult, { ok: false }>): string {
  switch (result.reason) {
    case "not-found":
      return "Este evento já não existe — recarrega a página.";
    case "live":
      return "Está no ar neste momento. Termina a transmissão antes de o apagar.";
    case "has-sales": {
      const compras = result.sales === 1 ? "1 compra" : `${formatNumber(result.sales)} compras`;
      return `Este evento já tem ${compras} — apagá-lo apagava o registo de quem pagou. Termina-o em vez de o apagar.`;
    }
    case "cloudflare":
      return "Não deu para apagar a stream na Cloudflare, por isso o evento fica como está. Tenta daqui a pouco.";
  }
}

/** Apaga um evento (e o live input na Cloudflare). Só quem gere eventos. */
export async function deleteEventAction(eventId: unknown): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!canManageEvents(user)) return { error: "Não tens permissão para apagar eventos." };
  if (typeof eventId !== "string" || eventId.length === 0) {
    return { error: "Pedido inválido — recarrega a página." };
  }

  let result: DeleteEventResult;
  try {
    result = await deleteEvent(eventId);
  } catch (error) {
    console.error("[eventos] apagar falhou:", error);
    return { error: "Não deu para apagar o evento. Espera um momento e tenta outra vez." };
  }
  if (!result.ok) return { error: refusalMessage(result) };

  refreshEventScreens(eventId);
  return {};
}
