import { NextResponse } from "next/server";
import { type AuthUser, getCurrentUser } from "@/server/authz";
import { type EventRow, inspectEvent } from "@/server/event-access";

/*
 * ============================================================================
 *  GUARDAS DAS ROTAS DE API — o adaptador HTTP do server/authz.ts
 * ============================================================================
 *
 * `server/authz.ts` (Frente A) responde a duas perguntas: "quem és?" e
 * "podes?". Uma rota de API precisa de uma terceira: "então o que te
 * devolvo?" — com o status certo e sem contar ao atacante nada que ele ainda
 * não saiba.
 *
 * Este ficheiro é essa camada, e existe para não haver dez cópias de
 * `if (!user) return NextResponse.json({ error: … }, { status: 401 })`
 * espalhadas pelas rotas. Quando a regra mudar, muda num sítio.
 *
 * USO — duas linhas, sempre iguais:
 *
 *   const gate = await requireApi(canManageEvents);
 *   if (!gate.ok) return gate.response;
 *   // daqui para baixo, `gate.user` está autenticado E autorizado.
 *
 * PORQUÊ UM RESULTADO E NÃO UMA EXCEÇÃO: numa rota de API queremos devolver
 * uma resposta, não fazer `redirect()` (inútil num fetch) nem rebentar para
 * um error boundary que devolveria 500 a um problema que é 403.
 *
 * REGRAS DE OURO DESTA CAMADA
 *  1. 401 = "não sei quem és" · 403 = "sei quem és e não podes".
 *  2. Nunca autorizar com dados vindos do cliente (body, query, headers).
 *     O papel vem SEMPRE da sessão, lida no servidor, a cada pedido.
 *  3. Recurso que não é teu responde 404, não 403 — 403 confirmaria que ele
 *     existe. (Ver `server/tickets.ts`, onde a query já filtra por dono.)
 *
 * O QUE MUDOU COM O MULTI-CANAL
 * Autorizar sobre um evento deixou de ser uma pergunta sobre o papel e passou a
 * ser uma pergunta sobre o CANAL do evento — por isso essas rotas usam
 * `requireApiForEvent`, e não `requireApi`. Um evento de outro canal responde
 * 404 pela regra 3: quem é dono de uma liga não pode usar a nossa API para
 * contar os eventos da liga do lado.
 */

/** Autenticado e autorizado, ou a resposta a devolver ao cliente. */
export type ApiGate = { ok: true; user: AuthUser } | { ok: false; response: NextResponse };

/** O mesmo, com o evento já carregado — quem chama não repete a query. */
export type EventApiGate =
  | { ok: true; user: AuthUser; event: EventRow }
  | { ok: false; response: NextResponse };

/** Predicado GLOBAL — `isPlatformAdmin`, `canEnterBackoffice`. */
type Can = (user: Pick<AuthUser, "role" | "memberships">) => boolean;

/** Predicado DE CANAL — `canManageEvents`, `canOperateEvents`. */
type CanInChannel = (user: AuthUser | null, channelId: string) => boolean;

const UNAUTHENTICATED = "Precisas de iniciar sessão.";
const UNAUTHORIZED = "Não tens permissão para isto.";
const NO_SUCH_EVENT = "Evento não encontrado.";

/**
 * Exige sessão e, opcionalmente, um predicado de autorização.
 *
 * Sem `can`, só verifica que há sessão — é o gate certo para as rotas em que
 * a autorização fina é a posse do recurso (a query filtra por `userId`).
 */
export async function requireApi(can?: Can): Promise<ApiGate> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: UNAUTHENTICATED }, { status: 401 }),
    };
  }

  if (can && !can(user)) {
    // Deliberadamente sem detalhe: não dizemos que papel faltava nem que
    // papel a pessoa tem. Quem precisa de saber já sabe.
    return {
      ok: false,
      response: NextResponse.json({ error: UNAUTHORIZED }, { status: 403 }),
    };
  }

  return { ok: true, user };
}

/**
 * Exige sessão E poder sobre ESTE evento, decidido pelo canal a que ele
 * pertence. É o gate certo para tudo o que trate de um evento concreto.
 *
 *   const gate = await requireApiForEvent(id, canOperateEvents);
 *   if (!gate.ok) return gate.response;
 *   // daqui para baixo, `gate.event` é um evento que `gate.user` pode operar.
 *
 * Sem sessão → 401. Com sessão mas sem poder sobre o evento → **404**, o mesmo
 * que um id inventado devolve: é a regra 3 lá de cima, e é o que impede alguém
 * de mapear os eventos de outra liga a partir das respostas.
 */
export async function requireApiForEvent(
  eventId: string,
  can: CanInChannel,
): Promise<EventApiGate> {
  const seen = await inspectEvent(eventId, can);

  if (seen.status === "anonymous") {
    return {
      ok: false,
      response: NextResponse.json({ error: UNAUTHENTICATED }, { status: 401 }),
    };
  }
  if (seen.status === "denied") {
    return {
      ok: false,
      response: NextResponse.json({ error: NO_SUCH_EVENT }, { status: 404 }),
    };
  }

  return { ok: true, user: seen.user, event: seen.event };
}
