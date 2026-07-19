import "server-only";
import { notFound } from "next/navigation";
import type { Channel } from "@/lib/channels";
import {
  type AuthUser,
  canManageEvents,
  getCurrentUser,
  isPlatformAdmin,
  requireUser,
} from "@/server/authz";
import { getChannelById } from "@/server/channels";

/*
 * ============================================================================
 *  OS PORTÕES DOS ECRÃS DE CANAIS
 * ============================================================================
 *
 * Irmão de `server/event-access.ts`, e de propósito com a mesma forma: as
 * regras são de `server/authz.ts`, isto só lhes dá nome e escolhe o que
 * responder. Três estilos de chamada porque há três formas de recusar —
 * redirecionar (páginas), devolver mensagem (server actions) e devolver status
 * (API). A REGRA está escrita uma vez só, em `inspectChannel`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE O PREDICADO É `canManageEvents` E NÃO UM NOVO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Parece o predicado errado pelo nome, e é o certo pelo conteúdo: quem gere os
 * eventos e o DINHEIRO de uma liga é quem gere a liga. Um `canManageChannel`
 * novo seria o mesmo `platform_admin || owner do canal` escrito duas vezes — e
 * duas cópias da mesma regra de autorização é como uma delas fica para trás no
 * dia em que a regra mudar. `server/authz.ts` é fonte única de verdade; isto
 * consome-a, não a duplica.
 *
 * O `staff` fica de fora, e não é esquecimento: opera transmissão e porta, não
 * decide quem manda no canal nem que endereço público a liga tem.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  UM CANAL ALHEIO RESPONDE 404, NÃO 403
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Regra da casa (docs/SEGURANCA-APP.md): "recurso que não é teu responde 404 —
 * um 403 confirmaria que existe". Aqui pesa mais do que nos eventos: com 403,
 * o dono de uma liga varria ids e ficava a saber quantas ligas a plataforma
 * tem. "Não existe" e "não é teu" saem os dois como `denied`, para que quem
 * chama não tenha como os distinguir — logo não tenha como os revelar.
 *
 * ⚠️  NOVAS ROTAS DEBAIXO DE `/admin` — o gate desta página NÃO chega sozinho.
 * No App Router o layout e a página do mesmo segmento renderizam em paralelo,
 * por isso quem corta a sério é o `proxy.ts`. O matcher dele já apanha
 * `/admin/:path*`, portanto `/admin/canais/**` está coberto sem lhe mexer —
 * confirmado, não assumido. Ver a nota em `app/admin/layout.tsx`.
 */

export type ChannelInspection =
  | { status: "anonymous" }
  | { status: "denied"; user: AuthUser }
  | { status: "allowed"; user: AuthUser; channel: Channel };

/**
 * O núcleo: quem és, que canal é este, e podes mexer-lhe? Não decide o que
 * responder — isso é de quem chama, que sabe se está numa página ou numa action.
 */
export async function inspectChannel(channelId: string): Promise<ChannelInspection> {
  const user = await getCurrentUser();
  if (!user) return { status: "anonymous" };

  const channel = await getChannelById(channelId);
  if (!channel || !canManageEvents(user, channel.id)) return { status: "denied", user };

  return { status: "allowed", user, channel };
}

// ── Páginas (Server Components) ─────────────────────────────────────────────

/**
 * Abrir um ecrã de um canal concreto: marca, membros.
 * Devolve o canal já carregado — quem chama não repete a query.
 */
export async function requireChannelManager(
  channelId: string,
  next: string,
): Promise<{ user: AuthUser; channel: Channel }> {
  // `requireUser` primeiro: sem sessão o que se quer é o login com o destino de
  // volta, não um 404 que mandava a pessoa recomeçar.
  await requireUser({ next });

  const seen = await inspectChannel(channelId);
  if (seen.status !== "allowed") notFound();

  return { user: seen.user, channel: seen.channel };
}

/**
 * Abrir o ecrã de CRIAR um canal — o único sem canal de onde partir.
 *
 * Criar canais de raiz é da FirstRow. Um dono de liga edita o que é dele e
 * convida quem quiser para lá dentro, mas não abre ligas novas: cada canal é um
 * contrato, e quem os abre é quem os assina.
 */
export async function requireChannelCreator(next: string): Promise<AuthUser> {
  const user = await requireUser({ next });
  if (!isPlatformAdmin(user)) notFound();
  return user;
}

// ── Server actions ──────────────────────────────────────────────────────────

/*
 * As actions devolvem `{ error }` para o ecrã mostrar, por isso não podem
 * `notFound()`. A mensagem é a MESMA para "não existe" e para "não é teu" —
 * senão a recusa contava o que o 404 esconde.
 */
const NO_SUCH_CHANNEL = "Este canal já não existe — recarrega a página.";
const NOT_SIGNED_IN = "A tua sessão expirou — volta a entrar.";
const NOT_PLATFORM_ADMIN = "Só a FirstRow pode criar canais novos.";

export type ChannelPermit =
  | { ok: true; user: AuthUser; channel: Channel }
  | { ok: false; error: string };

/** Gerir um canal a partir de uma server action (marca, membros). */
export async function permitChannelManagement(channelId: string): Promise<ChannelPermit> {
  const seen = await inspectChannel(channelId);
  if (seen.status === "anonymous") return { ok: false, error: NOT_SIGNED_IN };
  if (seen.status === "denied") return { ok: false, error: NO_SUCH_CHANNEL };
  return { ok: true, user: seen.user, channel: seen.channel };
}

/** Criar um canal a partir de uma server action. */
export async function permitChannelCreation(): Promise<
  { ok: true; user: AuthUser } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: NOT_SIGNED_IN };
  // Aqui a recusa pode ser explícita: não há recurso nenhum cuja existência se
  // esteja a revelar, e "não podes" é mais útil do que um 404 sem explicação.
  if (!isPlatformAdmin(user)) return { ok: false, error: NOT_PLATFORM_ADMIN };
  return { ok: true, user };
}
