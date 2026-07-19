import { notFound } from "next/navigation";
import type { events } from "@/db/schema";
import {
  type AuthUser,
  canManageEvents,
  canOperateEvents,
  getCurrentUser,
  isPlatformAdmin,
  managedChannelIds,
  requireUser,
} from "@/server/authz";
import { getChannel, listChannels } from "@/server/channels";
import { getEvent } from "@/server/events";

/*
 * ============================================================================
 *  OS PORTÕES DOS ECRÃS DE EVENTOS — e de onde vem o canal
 * ============================================================================
 *
 * As regras são de `server/authz.ts`; isto dá-lhes nome e, sobretudo, RESPONDE
 * À PERGUNTA "que canal?". A resposta é sempre a mesma e não é negociável: o
 * canal vem do EVENTO que se está a abrir (`event.channelId`), nunca de um
 * valor por defeito e nunca de nada que o cliente mande.
 *
 * PORQUE É QUE UM EVENTO DE OUTRO CANAL DÁ 404 E NÃO 403
 * É a regra da casa (ver docs/SEGURANCA-APP.md): "recurso que não é teu
 * responde 404 — um 403 confirmaria que existe". Com 403, quem tivesse conta de
 * dono de uma liga podia varrer ids e ficar a saber quantos eventos a liga do
 * lado tem e quando. Aqui, um evento de outro canal é indistinguível de um id
 * inventado.
 *
 * Três estilos de chamada porque há três formas de recusar — redirecionar
 * (páginas), devolver mensagem (server actions) e devolver status (API, em
 * `server/api-guard.ts`). A REGRA, essa, está escrita uma vez só: `inspectEvent`.
 */

export type EventRow = typeof events.$inferSelect;

/** Os predicados de canal de `server/authz.ts` encaixam aqui. */
type EventPredicate = (user: AuthUser | null, channelId: string) => boolean;

export type EventInspection =
  | { status: "anonymous" }
  | { status: "denied"; user: AuthUser }
  | { status: "allowed"; user: AuthUser; event: EventRow };

/**
 * O núcleo: quem és, que evento é este, e podes mexer-lhe? Não decide o que
 * responder — isso é de quem chama, que sabe se está numa página, numa action
 * ou numa rota de API.
 *
 * "Não existe" e "não é teu" saem os dois como `denied`, de propósito: quem
 * chama não tem como os distinguir, logo não tem como os revelar.
 */
export async function inspectEvent(eventId: string, can: EventPredicate): Promise<EventInspection> {
  const user = await getCurrentUser();
  if (!user) return { status: "anonymous" };

  const event = await getEvent(eventId);
  if (!event || !can(user, event.channelId)) return { status: "denied", user };

  return { status: "allowed", user, event };
}

// ── Páginas (Server Components) ─────────────────────────────────────────────

async function gatePage(
  eventId: string,
  next: string,
  can: EventPredicate,
): Promise<{ user: AuthUser; event: EventRow }> {
  // `requireUser` primeiro: sem sessão o que se quer é o login com o destino de
  // volta, não um 404 que mandava a pessoa recomeçar.
  await requireUser({ next });

  const seen = await inspectEvent(eventId, can);
  if (seen.status !== "allowed") notFound();

  return { user: seen.user, event: seen.event };
}

/**
 * Ver e operar um evento: transmissão, espectadores, bilhetes à porta.
 * Devolve o evento já carregado — quem chama não repete a query.
 */
export function requireEventOperator(eventId: string, next: string) {
  return gatePage(eventId, next, canOperateEvents);
}

/** Criar, editar e apagar um evento — e ver quem comprou. */
export function requireEventManager(eventId: string, next: string) {
  return gatePage(eventId, next, canManageEvents);
}

// ── Server actions ──────────────────────────────────────────────────────────

/*
 * As actions devolvem `{ error }` para o formulário mostrar, por isso não
 * podem `notFound()`. A mensagem é a MESMA para "não existe" e para "não é
 * teu" — senão a recusa contava o que o 404 esconde.
 */
const NO_SUCH_EVENT = "Este evento já não existe — recarrega a página.";
const NOT_SIGNED_IN = "A tua sessão expirou — volta a entrar.";

export type EventPermit =
  | { ok: true; user: AuthUser; event: EventRow }
  | { ok: false; error: string };

async function permitAction(eventId: string, can: EventPredicate): Promise<EventPermit> {
  const seen = await inspectEvent(eventId, can);
  if (seen.status === "anonymous") return { ok: false, error: NOT_SIGNED_IN };
  if (seen.status === "denied") return { ok: false, error: NO_SUCH_EVENT };
  return { ok: true, user: seen.user, event: seen.event };
}

/** Operar o evento a partir de uma server action (pôr no ar, terminar). */
export function permitEventOperation(eventId: string) {
  return permitAction(eventId, canOperateEvents);
}

/** Gerir o evento a partir de uma server action (apagar). */
export function permitEventManagement(eventId: string) {
  return permitAction(eventId, canManageEvents);
}

// ── Criar: o único sítio onde o canal NÃO vem de um evento ──────────────────

export type ChannelChoice = { ok: true; channelId: string } | { ok: false; error: string };

/**
 * Em que canal é que este evento vai nascer?
 *
 * É a única operação sem evento à frente de onde tirar o canal, por isso é a
 * única que tem de o escolher — e escolher mal aqui é criar o evento na liga
 * errada, com o dinheiro a cair no sítio errado.
 *
 * A regra é: **na dúvida, recusa**. Nunca "assume o primeiro".
 *
 *  - canal pedido → tem de existir E ser um canal que a pessoa gere;
 *  - sem canal pedido e gere exatamente um → é esse, sem perguntar;
 *  - sem canal pedido e gere vários → recusa e pede que diga qual.
 *
 * Hoje, com um canal e um dono, cai sempre no caso do meio e ninguém dá por
 * ela. Quando entrar a segunda liga, o caso de baixo passa a ser o que impede
 * um engano caro — e é onde a UI da Frente F entra com o seletor.
 */
export async function resolveChannelForNewEvent(
  user: AuthUser,
  requestedSlug?: string,
): Promise<ChannelChoice> {
  if (requestedSlug) {
    const channel = await getChannel(requestedSlug);
    // Canal inexistente e canal alheio dão o mesmo erro — ver a nota do 404.
    if (!channel || !canManageEvents(user, channel.id)) {
      return { ok: false, error: "Canal desconhecido ou sem permissão para criar lá eventos." };
    }
    return { ok: true, channelId: channel.id };
  }

  const candidates = isPlatformAdmin(user)
    ? (await listChannels()).map((channel) => channel.id)
    : managedChannelIds(user);

  if (candidates.length === 0) {
    return { ok: false, error: "Não tens nenhum canal onde criar eventos." };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      error: "Tens mais do que um canal — indica em qual queres criar o evento.",
    };
  }
  return { ok: true, channelId: candidates[0] };
}
