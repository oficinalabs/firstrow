import {
  type AuthUser,
  canManageEvents,
  canOperateEvents,
  ForbiddenError,
  ROLES,
  type Role,
  requireUser,
} from "@/server/authz";

/*
 * Os dois portões dos ecrãs de eventos, num sítio só.
 *
 * As regras são de `server/authz.ts` (Frente A) — isto só lhes dá nome para as
 * páginas do backoffice não repetirem o par sessão-mais-papel a cada ficheiro.
 * As rotas de API usam `getCurrentUser()` + o predicado diretamente: querem
 * devolver 401/403, não redirecionar.
 */

/** Os papéis que passam num predicado — só para a mensagem de recusa sair certa. */
function allowedBy(predicate: (user: Pick<AuthUser, "role">) => boolean): readonly Role[] {
  return ROLES.filter((role) => predicate({ role }));
}

/** Ver e operar um evento: transmissão, espectadores, bilhetes à porta. */
export async function requireEventOperator(next: string): Promise<AuthUser> {
  const user = await requireUser({ next });
  if (!canOperateEvents(user)) throw new ForbiddenError(allowedBy(canOperateEvents), user.role);
  return user;
}

/** Criar, editar e apagar eventos — e ver quem comprou. */
export async function requireEventManager(next: string): Promise<AuthUser> {
  const user = await requireUser({ next });
  if (!canManageEvents(user)) throw new ForbiddenError(allowedBy(canManageEvents), user.role);
  return user;
}
