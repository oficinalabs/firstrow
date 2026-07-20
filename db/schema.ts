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
  /**
   * Segunda cor da liga. NULL quando ela escolheu só uma — e é diferente de
   * ter uma cor errada: sem segunda cor, `lib/colors.ts` faz `--tenant-2*` cair
   * na principal e quem consome nunca precisa de saber quantas foram escolhidas.
   */
  accentColorSecondary: text("accent_color_secondary"),
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
    /*
     * Texto livre do dono do canal sobre o evento. NULL = não escreveu nenhuma,
     * que é diferente de "escreveu e apagou" só para nós — para o ecrã é o mesmo
     * e a secção não aparece. Nullable e sem default: aditiva, sem tocar nas
     * linhas que já existem.
     *
     * O limite de tamanho é do `lib/event-rules.ts` e imposto no servidor; a
     * coluna é `text` para que uma descrição um pouco maior nunca seja um erro
     * de base de dados (que rebentava a gravação inteira) em vez de um erro de
     * campo com uma frase a explicar.
     */
    description: text("description"),
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
    /**
     * Quando pedimos a última cobrança MB WAY para esta compra.
     *
     * Não é o mesmo que `createdAt`: a compra é reutilizada em cada tentativa
     * (de propósito — não queremos linhas a acumular), mas a COBRANÇA não pode
     * ser. Sem isto, dois cliques faziam dois pedidos ao telemóvel da pessoa e
     * ela podia aceitar os dois: pagava duas vezes o mesmo acesso.
     */
    chargeRequestedAt: timestamp("charge_requested_at"),
    /**
     * Quando perguntámos à Eupago, pela última vez, se esta compra já foi paga.
     *
     * NULL = nunca perguntámos. É o travão partilhado da reconciliação: quem
     * está à espera faz polling de 3 em 3 segundos e cada verificação é uma
     * chamada à Eupago. Um contador em memória não servia — na Vercel cada
     * instância tem o seu e elas morrem entre pedidos (ver a nota em
     * `docs/SEGURANCA-APP.md` sobre `lib/rate-limit.ts`). A base de dados é o
     * único sítio onde o travão é o mesmo para todas as instâncias.
     */
    reconciledAt: timestamp("reconciled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("entitlements_user_event_uq").on(t.userId, t.eventId),
    // O varrimento da reconciliação procura sempre por estado + carimbo da
    // cobrança. Sem índice, ele lia a tabela toda de 5 em 5 minutos.
    index("entitlements_pending_idx").on(t.status, t.chargeRequestedAt),
  ],
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
    /**
     * Quando pedimos a última cobrança MB WAY para esta compra.
     *
     * Não é o mesmo que `createdAt`: a compra é reutilizada em cada tentativa
     * (de propósito — não queremos linhas a acumular), mas a COBRANÇA não pode
     * ser. Sem isto, dois cliques faziam dois pedidos ao telemóvel da pessoa e
     * ela podia aceitar os dois: pagava duas vezes o mesmo acesso.
     */
    chargeRequestedAt: timestamp("charge_requested_at"),
    /** Ver a nota homónima em `entitlements` — é o mesmo travão. */
    reconciledAt: timestamp("reconciled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("tickets_event_idx").on(t.eventId),
    index("tickets_user_idx").on(t.userId),
    index("tickets_pending_idx").on(t.status, t.chargeRequestedAt),
  ],
);

/**
 * Porque é que uma sessão foi REVOGADA. Ver a nota da tabela.
 *
 *   other_device — a conta começou a ver noutro dispositivo (partilha)
 *   watermark    — a marca de água foi removida ou tapada no browser
 *   no_access    — deixou de ter direito a ver a meio (reembolso, estorno)
 */
export const REVOKE_REASONS = ["other_device", "watermark", "no_access"] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];

/*
 * Concorrência: 1 reprodução por conta de cada vez. O player faz heartbeat e
 * descobre aí que foi cortado.
 *
 * DUAS FORMAS DE UMA SESSÃO ACABAR, e a diferença entre elas é a diferença
 * entre uma métrica que serve para alguma coisa e uma que mente:
 *
 *   `supersededAt` — o MESMO dispositivo voltou a começar (recarregou a
 *      página, abriu segundo separador). Substituição SILENCIOSA: continua a
 *      valer a regra de uma reprodução de cada vez (a sessão velha deixa de
 *      responder ao heartbeat), mas isto não é um bloqueio e não pode contar
 *      como tal.
 *
 *   `revokedAt` — foi OUTRO dispositivo, ou a marca de água foi adulterada.
 *      É o que a régie mostra como "sessões bloqueadas" e é o sinal de
 *      partilha de conta. `revokedReason` diz qual dos dois.
 *
 * PORQUÊ DUAS COLUNAS E NÃO UMA COM MOTIVO: `server/stats.ts` conta bloqueios
 * por `revokedAt is not null`. Enquanto a recarga do mesmo browser carimbava
 * `revokedAt`, a régie mostrava 7 "sessões cortadas" para uma pessoa sozinha
 * num browser só — media recargas e chamava-lhes partilha de conta. Com o
 * carimbo separado, a contagem passa a ser o que o nome diz sem que a query
 * precise de saber que isto existe.
 */
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
    /**
     * Que dispositivo é este — cookie httpOnly criado no primeiro play.
     *
     * NÃO é credencial: não abre nada, não autoriza nada. Serve só para
     * distinguir "a mesma pessoa recarregou" de "a conta abriu noutro sítio".
     * NULL nas sessões anteriores a esta coluna (e num cliente sem cookies),
     * e NULL nunca casa com NULL — sem dispositivo conhecido, o caminho é o
     * conservador: conta como outro dispositivo.
     */
    deviceId: text("device_id"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at").notNull().defaultNow(),
    /** Substituída pelo mesmo dispositivo — silenciosa, não é bloqueio. */
    supersededAt: timestamp("superseded_at"),
    revokedAt: timestamp("revoked_at"),
    /** Um de `REVOKE_REASONS`. Só faz sentido com `revokedAt` preenchido. */
    revokedReason: text("revoked_reason").$type<RevokeReason>(),
  },
  (t) => [
    index("playback_sessions_user_idx").on(t.userId),
    // As sessões vivas de uma conta — é a leitura de todos os `startSession`.
    index("playback_sessions_live_idx").on(t.userId, t.revokedAt, t.supersededAt),
  ],
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

/*
 * ============================================================================
 *  CONVERSA DO EVENTO — uma tabela, duas vidas
 * ============================================================================
 *
 * `chat_messages` é o chat ao vivo E os comentários do VOD. Não são duas
 * tabelas porque não são duas coisas: é a mesma conversa, sobre o mesmo evento,
 * com as mesmas pessoas e a mesma moderação — só muda o ritmo com que chega ao
 * ecrã (ver `server/chat.ts`). Duas tabelas obrigavam a duplicar a regra de
 * acesso, a moderação e a UI, e a decidir, em cada uma delas, o mesmo outra vez.
 *
 * QUEM ESCREVE E QUEM LÊ é decidido por `canWatchEvent` — a MESMA função que o
 * player usa. Não há aqui, nem em `server/chat.ts`, uma segunda opinião sobre
 * quem tem acesso: já custou caro a esta plataforma ter dois sítios a responder
 * à mesma pergunta.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /**
     * O evento estava `live` quando isto foi escrito?
     *
     * Guardado no momento da escrita, e não deduzido depois, porque depois já
     * não dá: quando o evento passa a `ended` nada regista a hora da passagem,
     * por isso nenhuma query consegue separar o que foi dito durante a
     * transmissão do que foi comentado a seguir. É essa separação que a página
     * do VOD mostra ("Durante a transmissão" / os comentários por baixo).
     */
    duringLive: boolean("during_live").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** Soft-delete: a mensagem desaparece do ecrã, a linha fica para auditoria. */
    deletedAt: timestamp("deleted_at"),
    /**
     * Quem apagou. `set null` e não `cascade`: apagar a conta de um moderador
     * não pode ressuscitar as mensagens que ele apagou.
     */
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    /*
     * O índice do polling. A leitura é sempre
     *   where event_id = ? and (created_at, id) > (?, ?) order by created_at, id
     * — o par (created_at, id) é o cursor, e é um PAR de propósito: só com
     * `created_at` duas mensagens do mesmo milissegundo (que numa batalha
     * acontecem) faziam o cursor saltar uma delas para sempre.
     */
    index("chat_messages_event_idx").on(t.eventId, t.createdAt, t.id),
    /*
     * As mensagens apagadas DEPOIS de o cliente as ter recebido. Sem isto, um
     * apagar de moderação só se via em quem entrasse a seguir: quem já tinha a
     * mensagem no ecrã continuava a vê-la, porque o polling só traz o que é
     * novo. Ver `deletedSince` em `server/chat.ts`.
     */
    index("chat_messages_deleted_idx").on(t.eventId, t.deletedAt),
  ],
);

/*
 * Silenciar uma conta NESTE evento — a outra metade da moderação.
 *
 * Por evento e não por canal: o castigo é proporcional ao sítio onde a pessoa
 * se portou mal, e não a segue para o resto da plataforma. Uma linha por
 * (evento, conta), reescrita a cada novo silenciamento — o histórico de quantas
 * vezes já foi silenciada não é o que a moderação precisa de saber ao vivo.
 *
 * NÃO existe filtro automático de linguagem, e é decisão de produto: isto é
 * battle rap, os palavrões são o género. A moderação é humana e é da liga.
 */
export const chatTimeouts = pgTable(
  "chat_timeouts",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Até quando. Uma data no passado é o mesmo que não estar silenciado. */
    until: timestamp("until").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Um silenciamento por pessoa por evento: silenciar outra vez estende o
    // prazo em vez de acumular linhas que ninguém sabe somar.
    uniqueIndex("chat_timeouts_event_user_uq").on(t.eventId, t.userId),
  ],
);

/*
 * Gosto num evento. Um por conta, alternável.
 *
 * Decisão do dono: a CONTAGEM é pública, QUEM gostou é privado. Por isso não há
 * (nem deve passar a haver) nenhuma leitura que devolva a lista de pessoas —
 * `server/chat.ts` só expõe o total e "eu gostei?". Anónimo vê a contagem e não
 * vota.
 *
 * O índice único é o que faz o "um por conta" ser verdade mesmo com dois
 * cliques em simultâneo: a segunda inserção não passa, em vez de somar dois.
 */
export const eventLikes = pgTable(
  "event_likes",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_likes_event_user_uq").on(t.eventId, t.userId),
    // A contagem pública é `count(*) where event_id = ?`.
    index("event_likes_event_idx").on(t.eventId),
  ],
);
