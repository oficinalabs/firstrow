import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/*
 * Papéis GLOBAIS — os que valem na plataforma inteira, sem canal nenhum à
 * frente. A BD é a verdade; `ADMIN_EMAILS` serve só para promover o primeiro
 * platform_admin (bootstrap). Ver `server/authz.ts` para os helpers de acesso.
 *
 *   platform_admin — nós, a FirstRow; vê e gere tudo, em todos os canais
 *   viewer         — espectador; compra e vê (o papel de toda a gente)
 *
 * SÓ ESTES DOIS, e é deliberado. `league_owner` e `league_staff` viviam aqui e
 * eram um bug à espera de acontecer: um papel global chamado "dono da liga"
 * dava, ao entrar a segunda liga, os eventos e o dinheiro dela a quem só devia
 * mandar na primeira. Gerir e operar são poderes DE UM CANAL e passaram para
 * `channel_members` (`owner` / `staff`, em `db/schema.ts`).
 *
 * A regra que fica: aqui em cima só mora o que é mesmo global.
 *
 * (Este ficheiro é regenerável com `pnpm auth:generate` — se o correres,
 * repõe este bloco à mão. O CLI do Better Auth não conhece o `ROLES`.)
 */
export const ROLES = ["platform_admin", "viewer"] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "viewer";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  // Nunca aceita valor vindo do cliente: em `lib/auth.ts` o campo é declarado
  // com `input: false`, senão um registo podia pedir role=platform_admin.
  role: text("role").$type<Role>().notNull().default(DEFAULT_ROLE),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});
