import { and, eq, inArray, ne, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { DEFAULT_ROLE, ROLES, type Role, user as userTable } from "@/db/auth-schema";
import { CHANNEL_ROLES, type ChannelRole, channelMembers } from "@/db/schema";
import { auth, authCapabilities } from "@/lib/auth";
import {
  BACKOFFICE_ROOT,
  type BackofficeGate,
  gateForPath,
  SCANNER_PATH,
} from "@/lib/backoffice-zones";

/*
 * ============================================================================
 *  AUTORIZAÇÃO — ponto único de verdade sobre "quem pode o quê, ONDE"
 * ============================================================================
 *
 * A BASE DE DADOS manda. `ADMIN_EMAILS` só promove o PRIMEIRO platform_admin
 * (bootstrap) e deixa de ter efeito assim que exista um — não é uma porta das
 * traseiras permanente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O PODER TEM DOIS ANDARES, E ISSO É O CERNE DESTE FICHEIRO
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   GLOBAL (coluna `user.role`)      platform_admin · viewer
 *   POR CANAL (`channel_members`)    owner · staff
 *
 * Antes era tudo global: `league_owner` numa coluna do utilizador. Com um canal
 * só, ninguém notava. Ao entrar a segunda liga, esse papel dava ao dono da
 * primeira os eventos e o DINHEIRO da segunda — sem nunca lhe termos dado nada.
 *
 * Por isso os predicados de eventos passaram a EXIGIR um canal. Não há
 * `canManageEvents(user)`: a pergunta sem canal não tem resposta certa, e uma
 * assinatura que a aceitasse era um convite a assumir o canal por defeito. O
 * compilador passa a apanhar quem se esqueça.
 *
 * `platform_admin` passa por cima de tudo, sem precisar de ser membro de nada.
 *
 * COMO USAR (a API que as outras frentes consomem):
 *
 *   Páginas (Server Components) — querem redirecionar:
 *     const user = await requireUser({ next: "/conta" });
 *     const user = await requireRole(["platform_admin"], { next: "/admin" });
 *
 *   Páginas do backoffice — o papel vem da ZONA (lib/backoffice-zones.ts):
 *     const user = await requireBackofficePage("/admin/subscritores");
 *
 *   Ecrãs de um evento — o canal vem do evento, e a resposta é 404 se não for
 *   teu (ver `server/event-access.ts`, que é onde isto deve ser feito):
 *     const { user, event } = await requireEventManager(id, "/admin/...");
 *
 *   Rotas de API — querem devolver status, não redirecionar:
 *     const gate = await requireApiForEvent(id, canManageEvents);
 *
 *   Predicados puros (sem I/O, servem cliente e servidor):
 *     isPlatformAdmin(user) · canManageEvents(user, channelId)
 *     canOperateEvents(user, channelId) · channelRoleOf(user, channelId)
 *     canManageAnyChannel(user) · canEnterBackoffice(user)
 *     canOpenBackofficePath(user, pathname) · backofficeHomeFor(user)
 *
 * PORQUE É QUE OS PREDICADOS CONTINUAM PUROS (e não `async`)
 * Ler a base de dados dentro de um predicado obrigava a `await` em todo o lado,
 * espalhava queries por ecrãs que já as fizeram, e tirava-lhes o uso no
 * cliente. Em vez disso, `getCurrentUser()` traz as filiações UMA vez por
 * pedido e os predicados continuam a ser aritmética sobre o que já está em mão.
 *
 * CUSTO, dito como é: `getCurrentUser()` faz agora uma query indexada a mais
 * por pedido autenticado — inclusive nas rotas de posse (playback, checkout),
 * que não olham para canais. É barato (índice por `user_id`, tabela minúscula)
 * e paga-se em ter UM só modelo mental: o utilizador chega sempre completo.
 * Se um dia pesar no heartbeat, o caminho é separar um `getCurrentUser()`
 * barato de um `getChannelUser()` completo e deixar o compilador exigir o
 * segundo nos predicados de canal — não é adivinhar aqui dentro.
 *
 * REGRA DE OURO: o `role` que chega ao browser serve para PINTAR ecrãs.
 * Autorizar é sempre aqui, no servidor, em cada pedido.
 */

export { DEFAULT_ROLE, ROLES, type Role } from "@/db/auth-schema";
export { CHANNEL_ROLES, type ChannelRole } from "@/db/schema";

/** O papel de alguém num canal concreto. */
export type ChannelMembership = { channelId: string; role: ChannelRole };

/** O utilizador tal como o resto da app o vê. `role` vem sempre preenchido. */
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  /** Papel GLOBAL. Poder sobre eventos vem de `memberships`, nunca daqui. */
  role: Role;
  /** Os canais onde esta pessoa manda, e com que papel. Vazio é o normal. */
  memberships: readonly ChannelMembership[];
};

/**
 * O mínimo que um predicado precisa de saber. Aceitar menos do que isto (só o
 * `role`) era o que permitia perguntar "podes gerir eventos?" sem canal.
 */
type Subject = Pick<AuthUser, "role" | "memberships"> | null;

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

/**
 * Papel de canal vindo da BD. Um valor desconhecido (schema à frente do código,
 * ou o contrário) NÃO é membro — nunca é acesso.
 */
function isChannelRole(value: unknown): value is ChannelRole {
  return typeof value === "string" && (CHANNEL_ROLES as readonly string[]).includes(value);
}

/** Tem algum dos papéis GLOBAIS dados? */
export function hasRole(user: Pick<AuthUser, "role"> | null, ...roles: Role[]): boolean {
  return user != null && roles.includes(user.role);
}

/** Nós, a FirstRow. Vê e gere tudo, em todos os canais. */
export function isPlatformAdmin(user: Pick<AuthUser, "role"> | null): boolean {
  return hasRole(user, "platform_admin");
}

/**
 * O papel desta pessoa NESTE canal, ou `null` se não for membro.
 *
 * Devolve `null` para o `platform_admin` que não seja membro: ele passa por
 * cima dos predicados, mas não é dono do canal — e a UI que quiser mostrar
 * "és owner de X" deve dizer a verdade.
 */
export function channelRoleOf(user: Subject, channelId: string): ChannelRole | null {
  if (!user) return null;
  const membership = user.memberships.find((m) => m.channelId === channelId);
  return membership && isChannelRole(membership.role) ? membership.role : null;
}

/** Criar, editar e apagar eventos DESTE canal (e mexer no dinheiro dele). */
export function canManageEvents(user: Subject, channelId: string): boolean {
  if (isPlatformAdmin(user)) return true;
  return channelRoleOf(user, channelId) === "owner";
}

/**
 * Operar um evento DESTE canal a decorrer: transmissão e validação à porta.
 * Inclui a equipa da liga — que opera mas não gere (nem apaga eventos).
 */
export function canOperateEvents(user: Subject, channelId: string): boolean {
  if (isPlatformAdmin(user)) return true;
  const role = channelRoleOf(user, channelId);
  return role === "owner" || role === "staff";
}

/**
 * Gere ALGUM canal — sem dizer qual.
 *
 * É a pergunta que se pode fazer onde não há canal no URL: `/admin/ganhos`,
 * `/admin/subscritores`, o botão de criar evento, a action de reconciliação.
 * Tudo isto é dinheiro ou dados de compradores, logo é `owner` e nunca `staff`.
 *
 * ⚠️ ISTO CHAMAVA-SE `canEnterBackoffice` E MUDOU DE NOME, não de regra.
 * O `canEnterBackoffice` passou a ser mais largo (deixa entrar o staff, que
 * precisa do scanner). Se estas chamadas tivessem ficado presas ao nome antigo,
 * alargar a porta abria de repente a contabilidade a quem valida bilhetes.
 * Separar os nomes obrigou o compilador a fazer a pergunta em cada sítio.
 */
export function canManageAnyChannel(user: Subject): boolean {
  if (isPlatformAdmin(user)) return true;
  return user?.memberships.some((m) => m.role === "owner") ?? false;
}

/**
 * Abre a porta do backoffice — e só a porta.
 *
 * `owner` **ou** `staff`: o `staff` existe precisamente para validar bilhetes à
 * porta, e o scanner vive em `/admin/scanner`. Enquanto isto exigiu `owner`, o
 * único papel feito para o scanner era o único que não lhe chegava.
 *
 * Passar aqui NÃO é ver o backoffice: é só não levar com a porta na cara. O que
 * cada ecrã exige está em `lib/backoffice-zones.ts` e é aplicado por
 * `canOpenBackofficePath` — no `proxy.ts` (que corta a sério) e no gate de cada
 * página. Quem só opera vê o scanner e os ecrãs do evento; dinheiro e
 * compradores continuam a pedir `canManageAnyChannel`.
 *
 * É também a pergunta do atalho "Backoffice" no header do site
 * (`components/ui/backoffice-link.tsx`): mostrar o atalho a quem tem alguma
 * coisa lá dentro, esconder-lho a quem não tem.
 */
export function canEnterBackoffice(user: Subject): boolean {
  if (isPlatformAdmin(user)) return true;
  return user?.memberships.some((m) => isChannelRole(m.role)) ?? false;
}

/**
 * Traduz um gate de zona no predicado que lhe corresponde.
 *
 * É o único sítio onde `BackofficeGate` vira "sim/não" — a tabela de caminhos
 * (`lib/backoffice-zones.ts`) diz DE QUE gate se precisa, isto diz QUEM o tem.
 */
export function satisfiesGate(user: Subject, gate: BackofficeGate): boolean {
  switch (gate) {
    case "platform":
      return isPlatformAdmin(user);
    case "manage":
      return canManageAnyChannel(user);
    case "operate":
      return canEnterBackoffice(user);
  }
}

/**
 * Pode esta pessoa abrir este caminho de `/admin`?
 *
 * A MESMA função no `proxy.ts` e no gate das páginas, de propósito: são os dois
 * pontos que decidem o mesmo acesso, e escrevê-lo duas vezes era pedir que um
 * dia divergissem. O proxy é quem corta a sério (no App Router o layout
 * renderiza em paralelo com a página); a página repete por defesa em
 * profundidade, para o caso de o matcher do proxy falhar.
 */
export function canOpenBackofficePath(user: Subject, pathname: string): boolean {
  return satisfiesGate(user, gateForPath(pathname));
}

/**
 * Onde é que o backoffice desta pessoa começa.
 *
 * Quem gere um canal entra pelo painel; quem só opera entra pelo scanner, que é
 * o que veio cá fazer. `null` para quem não tem nada lá dentro.
 *
 * Serve o atalho do header (para apontar já ao sítio certo, sem um salto pelo
 * meio) e o `proxy.ts` (para quem escreve `/admin` à mão não levar com uma
 * recusa por uma página que nunca pediu).
 */
export function backofficeHomeFor(user: Subject): string | null {
  if (canManageAnyChannel(user)) return BACKOFFICE_ROOT;
  if (canEnterBackoffice(user)) return SCANNER_PATH;
  return null;
}

/** Os canais onde esta pessoa gere eventos. Vazio para quem não gere nenhum. */
export function managedChannelIds(user: Subject): string[] {
  if (!user) return [];
  return user.memberships.filter((m) => m.role === "owner").map((m) => m.channelId);
}

/** Os canais onde esta pessoa gere OU opera eventos. */
export function operatedChannelIds(user: Subject): string[] {
  if (!user) return [];
  return user.memberships.filter((m) => isChannelRole(m.role)).map((m) => m.channelId);
}

// ── Âmbito: o que uma query agregada tem o direito de somar ─────────────────

/*
 * Os predicados acima respondem por UM evento. Os ecrãs de lista e as somas do
 * backoffice — receita do mês, compradores, extrato, eventos — não têm um
 * evento à frente: têm de saber sobre QUE canais podem falar.
 *
 * Sem isto, a resposta certa a "quanto faturei este mês?" era a soma de todos
 * os canais, e o dono da liga A via o dinheiro e os emails dos compradores da
 * liga B. É a mesma fuga do papel global, só que pela porta das estatísticas.
 *
 * `all: true` é o platform_admin. Para todos os outros vai a lista dos canais
 * deles — e uma lista VAZIA quer dizer "não pode ver nada", nunca "não filtres".
 */
export type ChannelScope = { all: true } | { all: false; channelIds: readonly string[] };

/** Canais cujo dinheiro e compradores esta pessoa pode ver (owner). */
export function manageScope(user: Subject): ChannelScope {
  if (isPlatformAdmin(user)) return { all: true };
  return { all: false, channelIds: managedChannelIds(user) };
}

/** Canais cujos eventos esta pessoa pode ver e operar (owner + staff). */
export function operateScope(user: Subject): ChannelScope {
  if (isPlatformAdmin(user)) return { all: true };
  return { all: false, channelIds: operatedChannelIds(user) };
}

/**
 * Traduz um âmbito para o `where` de uma query, sobre a coluna que guarda o
 * canal — `events.channel_id` numa tabela de eventos, `channels.id` na própria
 * tabela de canais.
 *
 * Está aqui, e não em cada ficheiro de queries, porque a linha que interessa é
 * a do meio e ela tem de ser escrita **uma vez só**: lista vazia devolve `false`
 * explícito, ou seja ZERO linhas. Uma segunda cópia deste `if` era uma segunda
 * oportunidade de o trocar por `undefined` — que o Postgres lê como "sem
 * filtro", e aí quem não gere canal nenhum passava a ver tudo.
 */
export function inScope(column: AnyPgColumn, scope: ChannelScope): SQL | undefined {
  if (scope.all) return undefined;
  if (scope.channelIds.length === 0) return sql`false`;
  return inArray(column, [...scope.channelIds]);
}

// ── Filiações ───────────────────────────────────────────────────────────────

/**
 * Os canais de que esta pessoa é membro.
 *
 * Uma query indexada por `user_id`. Linhas com papel desconhecido são deixadas
 * de fora aqui mesmo, para não haver um `ChannelRole` inválido a circular.
 */
export async function loadMemberships(userId: string): Promise<ChannelMembership[]> {
  const rows = await db
    .select({ channelId: channelMembers.channelId, role: channelMembers.role })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId));

  return rows.filter((row): row is ChannelMembership => isChannelRole(row.role));
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
 *
 * Traz as filiações de canal já resolvidas: a partir daqui, responder a
 * "podes?" não volta a tocar na base de dados.
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
    // como o papel menos poderoso, nunca como acesso. É também o que apanha as
    // contas que ficaram com `league_owner` de antes da migração multi-canal.
    role: isRole(sessionUser.role) ? sessionUser.role : DEFAULT_ROLE,
    memberships: await loadMemberships(sessionUser.id),
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
 * Exige sessão E um dos papéis GLOBAIS dados.
 * Sem sessão → redirect para `/entrar`. Com sessão mas sem papel →
 * `ForbiddenError` (quem chama decide se mostra 403, se apanha, se re-lança).
 *
 * Para poder sobre eventos NÃO uses isto: usa `server/event-access.ts`, que
 * decide pelo canal do evento.
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

/**
 * O gate de uma página do backoffice — sessão + o papel que a ZONA exige.
 *
 * UMA função e não um `if` copiado por página: o mesmo gate aparecia em cinco
 * ecrãs de dinheiro, e cinco cópias da mesma regra é como uma delas fica para
 * trás no dia em que a regra mudar. O que cada caminho exige está na tabela de
 * `lib/backoffice-zones.ts`, que é a MESMA que o `proxy.ts` lê.
 *
 * Devolve o utilizador já resolvido — quem chama não repete `requireUser`.
 *
 * ⚠️ Isto é a SEGUNDA linha, não a primeira. No App Router a página começa a
 * correr as queries antes de um gate de layout a poder travar, e o que impede
 * os dados de irem no payload é a ordem AQUI DENTRO (gate antes das queries)
 * mais o corte do `proxy.ts`, que trava o pedido antes de a página existir.
 * Por isso chama-se isto na PRIMEIRA linha da página, antes de qualquer query.
 */
export async function requireBackofficePage(pathname: string): Promise<AuthUser> {
  const user = await requireUser({ next: pathname });
  // `/sem-acesso` e não `notFound()`: quem chega aqui já passou a porta do
  // backoffice, portanto já sabe que ele existe — esconder a página não esconde
  // nada e deixava a pessoa sem perceber o que se passou.
  if (!canOpenBackofficePath(user, pathname)) redirect("/sem-acesso");
  return user;
}
