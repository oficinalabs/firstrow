import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/*
 * Papéis. A BD é a verdade — `ADMIN_EMAILS` serve só para promover o primeiro
 * platform_admin (bootstrap). Ver `server/authz.ts` para os helpers de acesso.
 *
 *   platform_admin — nós; vê e gere tudo na plataforma
 *   league_owner   — dono de uma liga; gere os eventos e o dinheiro da liga
 *   league_staff   — equipa da liga; opera transmissão e porta (QR)
 *   viewer         — espectador; compra e vê (o papel de toda a gente)
 */
export const ROLES = ["platform_admin", "league_owner", "league_staff", "viewer"] as const;

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
