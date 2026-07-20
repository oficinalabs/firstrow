import { notFound } from "next/navigation";
import type { events } from "@/db/schema";
import { CHANNEL_REQUIRED_MESSAGE } from "@/lib/event-rules";
import {
  type AuthUser,
  canManageEvents,
  canOperateEvents,
  getCurrentUser,
  manageScope,
  requireUser,
} from "@/server/authz";
import { channelsInScope, getChannel } from "@/server/channels";
import { hasActiveEntitlement } from "@/server/entitlements";
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

/**
 * Os canais onde este utilizador pode fazer nascer um evento.
 *
 * É a MESMA função que alimenta o seletor do formulário e a que
 * `resolveChannelForNewEvent` consulta para decidir. De propósito: se a lista
 * oferecida ao ecrã e a lista aceite pelo servidor fossem calculadas em sítios
 * diferentes, mais tarde ou mais cedo o formulário passava a oferecer um canal
 * que a gravação recusava — e o dono ficava a olhar para um erro sobre uma
 * escolha que nós lhe demos.
 */
export function listCreatableChannels(user: AuthUser) {
  return channelsInScope(manageScope(user));
}

/**
 * Porque é que não dá para decidir o canal. Quem chama traduz para o seu meio:
 * a rota de API para um status, o formulário para um erro ao lado do seletor.
 */
export type ChannelRefusal =
  /** Pediu um canal que não existe, ou que não é dele. */
  | "forbidden"
  /** Gere mais do que um e não disse qual — falta a escolha. */
  | "ambiguous"
  /** Não gere canal nenhum: não há onde criar. */
  | "none";

export type ChannelChoice =
  | { ok: true; channelId: string }
  | { ok: false; reason: ChannelRefusal; error: string };

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
 * O caso do meio é o que faz o formulário não perguntar nada a quem tem uma
 * liga só. O de baixo é o que impede o engano caro quando entrar a segunda — e
 * é para ele que existe o seletor.
 *
 * ⚠️ O `requestedSlug` vem do cliente, por isso NÃO é uma escolha: é um pedido,
 * e é revalidado contra `canManageEvents` a cada chamada. O formulário só
 * oferece canais legítimos, mas quem falar com a API à mão não passa por ele.
 */
export async function resolveChannelForNewEvent(
  user: AuthUser,
  requestedSlug?: string,
): Promise<ChannelChoice> {
  if (requestedSlug) {
    const channel = await getChannel(requestedSlug);
    // Canal inexistente e canal alheio dão o mesmo erro — ver a nota do 404.
    if (!channel || !canManageEvents(user, channel.id)) {
      return {
        ok: false,
        reason: "forbidden",
        error: "Canal desconhecido ou sem permissão para criar lá eventos.",
      };
    }
    return { ok: true, channelId: channel.id };
  }

  const { list } = await listCreatableChannels(user);

  if (list.length === 0) {
    return { ok: false, reason: "none", error: "Não tens nenhum canal onde criar eventos." };
  }
  if (list.length > 1) {
    return { ok: false, reason: "ambiguous", error: CHANNEL_REQUIRED_MESSAGE };
  }
  return { ok: true, channelId: list[0].id };
}

/* ------------------------------------------------------------------ *
 * QUEM PODE VER — e QUAL vídeo é que se vê
 * ------------------------------------------------------------------ */

/**
 * O vídeo que este evento toca agora: a gravação se já terminou, senão o direto.
 *
 * Não são o mesmo recurso na Cloudflare, e o token de reprodução é assinado
 * PARA UM recurso concreto (vai no `sub` do JWT). Assinar o live input para ver
 * uma gravação dá um token válido para a coisa errada — e o player fica em
 * branco sem dizer porquê. Era o que acontecia: o mint assinava sempre
 * `cfLiveInputId`, portanto NENHUMA gravação tocava, nem para quem tinha pago.
 */
export function playbackTarget(event: EventRow): { id: string; isVod: boolean } | null {
  if (event.status === "ended" && event.cfVodUid) {
    return { id: event.cfVodUid, isVod: true };
  }
  if (event.cfLiveInputId) return { id: event.cfLiveInputId, isVod: false };
  return null;
}

/**
 * Pode esta pessoa ver este evento?
 *
 * Duas vias, e a segunda faltava: **ter comprado**, ou **operar o canal do
 * evento**. Sem a segunda, quem organiza a liga não conseguia rever a própria
 * transmissão — tinha de comprar o seu próprio evento para lhe aceder, o que é
 * absurdo e impede o trabalho normal (rever qualidade, cortar excertos,
 * responder a uma reclamação sobre o que se passou).
 *
 * O papel é verificado CONTRA O CANAL DO EVENTO (`canOperateEvents(user,
 * event.channelId)`), nunca de forma global: o dono da liga A continua sem ver
 * de graça o conteúdo pago da liga B. É a mesma regra do resto do backoffice.
 */
export async function canWatchEvent(user: AuthUser, event: EventRow): Promise<boolean> {
  if (canOperateEvents(user, event.channelId)) return true;
  return hasActiveEntitlement(user.id, event.id);
}
