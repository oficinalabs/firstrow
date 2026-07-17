import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Um evento (batalha) de uma liga. Fase 0 é single-tenant, por isso ainda sem tabela `tenants`.
export const events = pgTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  priceCents: integer("price_cents").notNull(),
  // draft | live | ended
  status: text("status").notNull().default("draft"),
  cfLiveInputId: text("cf_live_input_id"),
  cfVodUid: text("cf_vod_uid"),
  // Bilhetes físicos: NULL = evento sem bilhetes à porta.
  ticketPriceCents: integer("ticket_price_cents"),
  ticketCapacity: integer("ticket_capacity"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Direito de acesso: quem comprou o quê. Compra one-off (PPV) na Fase 0.
export const entitlements = pgTable(
  "entitlements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // active | refunded
    status: text("status").notNull().default("active"),
    providerRef: text("provider_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entitlements_user_event_uq").on(t.userId, t.eventId)],
);

// Bilhete físico: comprado por MB WAY, validado à porta por QR (1 bilhete = 1 QR único).
export const tickets = pgTable(
  "tickets",
  {
    // Prefixo "tkt_" — o webhook Eupago distingue tickets de entitlements pelo identifier.
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // NULL até o pagamento confirmar; gerado criptograficamente ao emitir.
    qrToken: text("qr_token").unique(),
    // pending | issued | used | refunded
    status: text("status").notNull().default("pending"),
    usedAt: timestamp("used_at"),
    priceCents: integer("price_cents").notNull(),
    providerRef: text("provider_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tickets_event_idx").on(t.eventId), index("tickets_user_idx").on(t.userId)],
);

// Concorrência: 1 sessão a ver por conta. O player faz heartbeat; 2a sessão é recusada.
export const playbackSessions = pgTable(
  "playback_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at").notNull().defaultNow(),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [index("playback_sessions_user_idx").on(t.userId)],
);
