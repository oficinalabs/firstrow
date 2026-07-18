import { and, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { DEFAULT_ROLE, ROLES, type Role, user as userTable } from "@/db/auth-schema";
import { auth, authCapabilities } from "@/lib/auth";

/*
 * ============================================================================
 *  AUTORIZAÇÃO — ponto único de verdade sobre "quem pode o quê"
 * ============================================================================
 *
 * A BASE DE DADOS manda. `ADMIN_EMAILS` só promove o PRIMEIRO platform_admin
 * (bootstrap) e deixa de ter efeito assim que exista um — não é uma porta das
 * traseiras permanente.
 *
 * COMO USAR (a API que as outras frentes consomem):
 *
 *   Páginas (Server Components) — querem redirecionar:
 *     const user = await requireUser({ next: "/conta" });
 *     const user = await requireRole(["platform_admin"], { next: "/admin" });
 *
 *   Rotas de API — querem devolver status, não redirecionar:
 *     const user = await getCurrentUser();
 *     if (!user) return NextResponse.json({ erro: "..." }, { status: 401 });
 *     if (!canManageEvents(user)) return NextResponse.json({ erro: "..." }, { status: 403 });
 *
 *   Predicados puros (sem I/O, servem cliente e servidor):
 *     isPlatformAdmin(user) · canManageEvents(user) · canOperateEvents(user) · hasRole(user, ...)
 *
 * REGRA DE OURO: o `role` que chega ao browser serve para PINTAR ecrãs.
 * Autorizar é sempre aqui, no servidor, em cada pedido.
 */

export { DEFAULT_ROLE, ROLES, type Role } from "@/db/auth-schema";

/** O utilizador tal como o resto da app o vê. `role` vem sempre preenchido. */
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: Role;
};

/** Lançado por `requireRole` quando há sessão mas falta o papel. */
export class ForbiddenError extends Error {
  readonly allowed: readonly Role[];
  readonly actual: Role;

  constructor(allowed: readonly Role[], actual: Role) {
    super(`Acesso negado: precisa de ${allowed.join(" ou ")} (tem ${actual}).`);
    this.name = "ForbiddenError";
    this.allowed = allowed;
    this.actual = actual;
  }
}

// ── Predicados puros ────────────────────────────────────────────────────────

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Tem algum dos papéis dados? */
export function hasRole(user: Pick<AuthUser, "role"> | null, ...roles: Role[]): boolean {
  return user != null && roles.includes(user.role);
}

/** Nós. Vê e gere tudo — o papel que abre o backoffice todo. */
export function isPlatformAdmin(user: Pick<AuthUser, "role"> | null): boolean {
  return hasRole(user, "platform_admin");
}

/** Criar, editar e apagar eventos (e mexer no dinheiro da liga). */
export function canManageEvents(user: Pick<AuthUser, "role"> | null): boolean {
  return hasRole(user, "platform_admin", "league_owner");
}

/**
 * Operar um evento a decorrer: transmissão e validação de bilhetes à porta.
 * Inclui a equipa da liga — que opera mas não gere (nem apaga eventos).
 */
export function canOperateEvents(user: Pick<AuthUser, "role"> | null): boolean {
  return hasRole(user, "platform_admin", "league_owner", "league_staff");
}

// ── Bootstrap do primeiro admin ─────────────────────────────────────────────

function bootstrapEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Promove o primeiro platform_admin a partir de `ADMIN_EMAILS`.
 *
 * Só acontece enquanto NÃO existir nenhum platform_admin na base de dados.
 * A partir daí a lista deixa de contar: acrescentar um email ao `ADMIN_EMAILS`
 * de um projeto já arrancado não dá poderes a ninguém. Promoções seguintes
 * são alterações à coluna `role`.
 *
 * (Duas sessões em simultâneo podiam promover dois emails da lista ao mesmo
 * tempo — são ambos operadores de confiança escolhidos pelo dono, por isso não
 * vale a pena um lock só para isto.)
 */
async function bootstrapPlatformAdmin(user: AuthUser): Promise<AuthUser> {
  if (user.role === "platform_admin") return user;
  if (!bootstrapEmails().includes(user.email.toLowerCase())) return user;
  // Com verificação ligada, um email por confirmar nunca vira admin.
  if (authCapabilities.emailVerificationRequired && !user.emailVerified) return user;

  const [existingAdmin] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(and(eq(userTable.role, "platform_admin"), ne(userTable.id, user.id)))
    .limit(1);
  if (existingAdmin) return user;

  await db
    .update(userTable)
    .set({ role: "platform_admin", updatedAt: new Date() })
    .where(eq(userTable.id, user.id));

  console.info(`[authz] ${user.email} promovido a platform_admin (bootstrap ADMIN_EMAILS).`);
  return { ...user, role: "platform_admin" };
}

// ── Leitura da sessão ───────────────────────────────────────────────────────

/**
 * O utilizador do pedido atual, ou `null` se não houver sessão.
 * Não redireciona nem lança — é a base para as rotas de API.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const sessionUser = session.user as typeof session.user & { role?: unknown };
  const user: AuthUser = {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    emailVerified: sessionUser.emailVerified,
    image: sessionUser.image,
    // Defesa contra desalinhamento BD↔código: um valor desconhecido é tratado
    // como o papel menos poderoso, nunca como acesso.
    role: isRole(sessionUser.role) ? sessionUser.role : DEFAULT_ROLE,
  };

  return bootstrapPlatformAdmin(user);
}

/**
 * Exige sessão. Sem ela, manda para `/entrar` guardando o destino de volta.
 * Para rotas de API usa `getCurrentUser()` — um redirect numa API é inútil.
 */
export async function requireUser(options: { next?: string } = {}): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    const { next } = options;
    redirect(next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar");
  }
  return user;
}

/**
 * Exige sessão E um dos papéis dados.
 * Sem sessão → redirect para `/entrar`. Com sessão mas sem papel →
 * `ForbiddenError` (quem chama decide se mostra 403, se apanha, se re-lança).
 */
export async function requireRole(
  roles: readonly Role[],
  options: { next?: string } = {},
): Promise<AuthUser> {
  const user = await requireUser(options);
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(roles, user.role);
  }
  return user;
}
