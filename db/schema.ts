import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

/*
 * Canal (liga) — o tenant da plataforma. Deixou de ser uma lista em código
 * (`lib/channels.ts`) e passou a ser dados: é isto que permite entrar uma
 * segunda liga sem que o dono da primeira fique dono dos eventos dela.
 *
 * As colunas são as do tipo `Channel` que vivia em código, uma a uma. São
 * dados de CONFIGURAÇÃO e públicos (marca do canal) — nada aqui é segredo, e
 * `lib/channels.ts` escolhe explicitamente as colunas que viajam para o
 * browser, para que acrescentar uma coluna nunca a publique por acidente.
 */
export const channels = pgTable("channels", {
  id: text("id").primaryKey(),
  // Entra no URL público (/canal/<slug>) — daí o índice único.
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  /** Cor do canal (dados de configuração, não token de design). */
  accentColor: text("accent_color").notNull(),
  /** Caminho público do logo; NULL → placeholder com as iniciais. */
  logoUrl: text("logo_url"),
  /** Imagem de banner; NULL → sem banner. */
  bannerUrl: text("banner_url"),
  initials: text("initials").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/*
 * Papéis DENTRO de um canal. Ver `db/auth-schema.ts` para os globais.
 *
 *   owner — dono da liga; gere os eventos e o dinheiro DESTE canal
 *   staff — equipa da liga; opera transmissão e porta (QR) DESTE canal
 *
 * Não existe "membro sem papel": quem não está na tabela não é membro.
 */
export const CHANNEL_ROLES = ["owner", "staff"] as const;

export type ChannelRole = (typeof CHANNEL_ROLES)[number];

/*
 * Quem é o quê em cada canal. É esta tabela que fecha o buraco do modelo
 * antigo: com o papel na coluna `user.role`, um `league_owner` era dono de
 * TODOS os canais — incluindo os eventos e o dinheiro de uma liga que nunca
 * viu. Aqui o poder chega sempre agarrado a um canal.
 */
export const channelMembers = pgTable(
  "channel_members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    role: text("role").$type<ChannelRole>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Uma pessoa tem UM papel em cada canal. Sem isto, duas linhas
    // (owner + staff) deixavam a pergunta "o que pode?" sem resposta única.
    uniqueIndex("channel_members_user_channel_uq").on(t.userId, t.channelId),
    // A autorização lê sempre por utilizador, uma vez por pedido.
    index("channel_members_user_idx").on(t.userId),
  ],
);

// Um evento (batalha) de um canal.
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    /*
     * O canal a que o evento pertence. É a coluna de que depende TODA a
     * autorização do backoffice: quem pode mexer neste evento é quem tem papel
     * NESTE canal.
     *
     * `restrict` e não `cascade`: apagar um canal com eventos tem de falhar.
     * Em cascade, apagar um canal levava atrás os eventos e, por baixo deles,
     * os `entitlements` e os `tickets` — o registo de quem pagou. Mesma regra
     * que já protege um evento vendido em `server/events.ts:deleteEvent`.
     */
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "restrict" }),
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
  },
  // Quase todas as queries do backoffice filtram por canal.
  (t) => [index("events_channel_idx").on(t.channelId)],
);

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

/*
 * Que texto de consentimento foi mostrado nesta compra. Os três casos da
 * secção 6 de `docs/legal/CONTEUDO-PAGINAS.md`:
 *
 *   bilhete — evento presencial com data marcada (só informativo, sem checkbox)
 *   ppv     — acesso a uma live com data marcada (checkbox obrigatória)
 *   vod     — arquivo já gravado; renúncia expressa aos 14 dias (checkbox)
 */
export const CONSENT_KINDS = ["bilhete", "ppv", "vod"] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

/*
 * ============================================================================
 *  PROVA DE CONSENTIMENTO — o que foi mostrado a quem, e quando
 * ============================================================================
 *
 * Exigência de `docs/legal/CONTEUDO-PAGINAS.md` (secção 6): por cada compra
 * temos de conseguir apresentar, numa disputa, o **texto exato** que a pessoa
 * viu antes de pagar, com data/hora, IP e conta. Não chega dizer "está nos
 * Termos" — a prova é por compra.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE NENHUMA CHAVE ESTRANGEIRA AQUI É `cascade`
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A mesma política diz que faturação e histórico de compras se guardam **10
 * anos, mesmo depois de a conta ser fechada**. Uma prova que desaparecesse com
 * a conta, com o evento ou com a compra não era prova nenhuma — era o oposto:
 * bastava apagar a conta para o registo se evaporar exatamente quando é preciso.
 *
 * Por isso as ligações são todas `set null` e **os dados que provam alguma
 * coisa estão copiados para a própria linha** (`userEmail`, `eventTitle`,
 * `consentText`). A linha vale por si, mesmo sem nada à volta.
 *
 * ⚠️ RETENÇÃO: o `ipAddress` daqui NÃO é um log de sessão. A política dá 90
 * dias aos registos de sessão/IP e 10 anos à faturação; este IP é parte da
 * prova da compra, logo segue os 10 anos. Uma limpeza periódica de IPs não
 * pode varrer esta tabela.
 *
 * É um registo em ACRESCENTO, sem unicidade por compra: se alguém voltar ao
 * checkout e aceitar outra vez, ficam as duas linhas. O histórico de quando se
 * consentiu é mais defensável do que uma linha reescrita.
 *
 * (Só a tabela é desta frente. Quem a preenche é o fluxo de checkout.)
 */
export const purchaseConsents = pgTable(
  "purchase_consents",
  {
    id: text("id").primaryKey(),

    // ── Ligações: úteis para navegar, nunca para sustentar a prova ──────────
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
    /** A compra: exatamente uma destas fica preenchida (PPV/VOD vs. bilhete). */
    entitlementId: text("entitlement_id").references(() => entitlements.id, {
      onDelete: "set null",
    }),
    ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "set null" }),

    // ── A prova: cópia do que era verdade no momento da compra ──────────────
    /** Quem era, à data. Sobrevive ao apagar da conta — é o registo fiscal. */
    userEmail: text("user_email").notNull(),
    /** O que estava a comprar, à data. */
    eventTitle: text("event_title").notNull(),
    kind: text("kind").$type<ConsentKind>().notNull(),
    /** O texto **exato** mostrado. É isto que se apresenta numa disputa. */
    consentText: text("consent_text").notNull(),
    /** Versão do texto legal, para saber que redação estava em vigor. */
    textVersion: text("text_version").notNull(),
    /**
     * Resultado da checkbox. NULL quando o caso não tem checkbox (bilhete
     * presencial, que é só informativo) — distinto de `false`, que seria
     * "mostrou-se e não aceitou".
     */
    checkboxAccepted: boolean("checkbox_accepted"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("purchase_consents_user_idx").on(t.userId),
    index("purchase_consents_entitlement_idx").on(t.entitlementId),
    index("purchase_consents_ticket_idx").on(t.ticketId),
  ],
);
