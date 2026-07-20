"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type EventFormState,
  eventEditRules,
  eventHubPath,
  eventToDraft,
  validateEventForm,
} from "@/lib/event-rules";
import { formatNumber } from "@/lib/format";
import { type AuthUser, getCurrentUser } from "@/server/authz";
import { permitEventManagement, resolveChannelForNewEvent } from "@/server/event-access";
import {
  createEvent,
  type DeleteEventResult,
  deleteEvent,
  describeSaveFailure,
  provisionLiveInput,
  readCommitments,
  updateEvent,
} from "@/server/events";

/*
 * Ações de eventos do backoffice. Uma server action é um endpoint como
 * qualquer outro: valida os papéis e os dados aqui, sempre — o formulário do
 * outro lado é conveniência, não segurança.
 *
 * Com o multi-canal, "que papel tens?" deixou de chegar: a pergunta é "podes
 * mexer NESTE canal?". Para apagar e editar, o canal vem do evento
 * (`permitEventManagement`); para criar, é escolhido em
 * `resolveChannelForNewEvent` — que recusa em vez de adivinhar.
 */

function refreshEventScreens(eventId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/eventos");
  if (eventId) {
    revalidatePath(eventHubPath(eventId));
    revalidatePath(`/admin/eventos/${eventId}/editar`);
    revalidatePath(`/admin/eventos/${eventId}/bilhetes`);
    // O que muda num evento muda também no que o público vê dele.
    revalidatePath(`/eventos/${eventId}`);
  }
}

/** A mesma frase em todas as recusas por "já cá não está" — ver server/event-access.ts. */
const NO_LONGER_EXISTS = "Este evento já não existe — recarrega a página.";

/**
 * A sessão caiu a meio de um formulário cheio.
 *
 * Devolver só a frase deixava a pessoa num beco: tudo escrito, e nenhum sítio
 * onde carregar que não perdesse o que lá está. Com o caminho de volta, abre-se
 * a sessão noutro separador e submete-se outra vez — os campos são controlados,
 * por isso continuam preenchidos.
 */
function sessionExpired(values: EventFormState["values"], back: string): EventFormState {
  return {
    errors: {},
    message: "A tua sessão expirou. Volta a entrar e submete outra vez — o que escreveste fica aí.",
    signInHref: `/entrar?next=${encodeURIComponent(back)}`,
    values,
  };
}

/** Há sessão? Devolve o utilizador, ou o estado de formulário já redigido. */
async function requireFormUser(
  submitted: unknown,
  back: string,
): Promise<{ user: AuthUser } | { state: EventFormState }> {
  const user = await getCurrentUser();
  if (user) return { user };
  const { values } = validateEventForm(submitted);
  return { state: sessionExpired(values, back) };
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

  const signedIn = await requireFormUser(submitted, "/admin/eventos/novo");
  if ("state" in signedIn) return signedIn.state;
  const { user } = signedIn;

  /*
   * Em que canal nasce este evento. O formulário manda o slug — escolhido no
   * seletor quando há mais do que um canal, preenchido em silêncio quando só
   * há um — mas isso é conveniência: o que decide é a revalidação aqui, que
   * corre com ou sem formulário do outro lado.
   *
   * Um `canal` vazio conta como não indicado (é o que o `<select>` manda antes
   * de alguém lhe tocar), e aí a decisão volta a ser de quem resolve: um canal
   * só resolve-se sozinho, vários recusam.
   */
  const submittedChannel = typeof submitted.canal === "string" ? submitted.canal.trim() : "";
  const channel = await resolveChannelForNewEvent(user, submittedChannel || undefined);
  if (!channel.ok) {
    const { values } = validateEventForm(submitted);
    /*
     * "Escolhe o canal" e "esse canal não é teu" são queixas sobre o SELETOR, e
     * é para ele que a pessoa está a olhar — a mensagem tem de aparecer ao pé
     * dele, não no fim do formulário. Só "não tens canal nenhum" é que não tem
     * campo onde encostar.
     */
    return channel.reason === "none"
      ? { errors: {}, message: channel.error, values }
      : { errors: { canal: channel.error }, message: "", values };
  }

  const checked = validateEventForm(submitted);
  if (!checked.ok) {
    return { errors: checked.errors, message: "", values: checked.values };
  }

  let created: Awaited<ReturnType<typeof createEvent>>;
  try {
    created = await createEvent(checked.draft, channel.channelId);
  } catch (error) {
    console.error("[eventos] criar falhou:", error);
    // A Cloudflare em baixo e a nossa base de dados em baixo não são a mesma
    // coisa para quem está do outro lado — ver `describeSaveFailure`.
    return { errors: {}, message: describeSaveFailure(error).message, values: checked.values };
  }

  refreshEventScreens(created.id);
  // Fora do try: o redirect do Next funciona por exceção e não é um erro.
  redirect(eventHubPath(created.id));
}

/**
 * Grava alterações a um evento que já existe.
 *
 * O `eventId` vem LIGADO no servidor (`updateEventAction.bind(null, id)`), não
 * do formulário: um campo escondido dava a quem soubesse mexer no HTML a
 * hipótese de gravar as alterações de um ecrã por cima de outro evento. O canal
 * continua a sair do evento — quem não gere o canal dele leva a mesma resposta
 * que levaria de um id inventado.
 */
export async function updateEventAction(
  eventId: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const submitted = Object.fromEntries(formData);
  const back = `/admin/eventos/${eventId}/editar`;

  const signedIn = await requireFormUser(submitted, back);
  if ("state" in signedIn) return signedIn.state;

  const permit = await permitEventManagement(eventId);
  if (!permit.ok) {
    const { values } = validateEventForm(submitted);
    return { errors: {}, message: permit.error, values };
  }

  /*
   * As regras saem das vendas que este evento já tem. É a mesma função que
   * pintou o ecrã, por isso o que aparece fechado e o que é recusado aqui não
   * podem discordar — e o `updateEvent` volta a fazer as contas DENTRO da
   * transação, que é o que aguenta uma compra a entrar entretanto.
   */
  const commitments = await readCommitments(eventId, permit.event.status);
  const checked = validateEventForm(submitted, {
    editing: { current: eventToDraft(permit.event), rules: eventEditRules(commitments) },
  });
  if (!checked.ok) return { errors: checked.errors, message: "", values: checked.values };

  let saved: Awaited<ReturnType<typeof updateEvent>>;
  try {
    saved = await updateEvent(eventId, checked.draft);
  } catch (error) {
    console.error("[eventos] guardar falhou:", error);
    return { errors: {}, message: describeSaveFailure(error).message, values: checked.values };
  }

  if (!saved.ok) {
    return saved.reason === "not-found"
      ? { errors: {}, message: NO_LONGER_EXISTS, values: checked.values }
      : { errors: saved.errors, message: "", values: checked.values };
  }

  refreshEventScreens(eventId);
  // Para a lista, que é onde a alteração se vê — a confirmação honesta de que
  // gravou é o valor novo lá, e não um aviso a dizê-lo. (Mesma escolha da
  // edição de canais, em app/admin/canais.)
  redirect("/admin/eventos");
}

/**
 * Volta a pedir à Cloudflare a stream de um evento que ficou sem ela.
 *
 * Só quem gere o canal do evento: provisionar custa dinheiro na conta da liga.
 */
export async function provisionStreamAction(eventId: unknown): Promise<{ error?: string }> {
  if (typeof eventId !== "string" || eventId.length === 0) {
    return { error: "Pedido inválido — recarrega a página." };
  }

  const permit = await permitEventManagement(eventId);
  if (!permit.ok) return { error: permit.error };

  try {
    const result = await provisionLiveInput(eventId);
    if (!result.ok) return { error: NO_LONGER_EXISTS };
  } catch (error) {
    console.error("[eventos] provisionar stream falhou:", error);
    return { error: describeSaveFailure(error).message };
  }

  refreshEventScreens(eventId);
  return {};
}

function refusalMessage(result: Extract<DeleteEventResult, { ok: false }>): string {
  switch (result.reason) {
    case "not-found":
      return NO_LONGER_EXISTS;
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

/** Apaga um evento (e o live input na Cloudflare). Só quem gere o canal DELE. */
export async function deleteEventAction(eventId: unknown): Promise<{ error?: string }> {
  if (typeof eventId !== "string" || eventId.length === 0) {
    return { error: "Pedido inválido — recarrega a página." };
  }

  // O canal vem do evento. Um evento de outra liga dá a mesma resposta que um
  // id inventado — ver a nota do 404 em `server/event-access.ts`.
  const permit = await permitEventManagement(eventId);
  if (!permit.ok) return { error: permit.error };

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
