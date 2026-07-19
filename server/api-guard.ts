import { NextResponse } from "next/server";
import { type AuthUser, getCurrentUser } from "@/server/authz";

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
 */

/** Autenticado e autorizado, ou a resposta a devolver ao cliente. */
export type ApiGate = { ok: true; user: AuthUser } | { ok: false; response: NextResponse };

/** Predicado de autorização — os de `server/authz.ts` encaixam aqui. */
type Can = (user: Pick<AuthUser, "role">) => boolean;

const UNAUTHENTICATED = "Precisas de iniciar sessão.";
const UNAUTHORIZED = "Não tens permissão para isto.";

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
