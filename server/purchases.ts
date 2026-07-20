import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { entitlements, events, tickets } from "@/db/schema";
import { type ChannelScope, inScope } from "@/server/authz";
import type { PurchaseKind } from "@/server/fulfilment";

export type Purchase = {
  entitlementId: string;
  eventId: string;
  eventTitle: string;
  startsAt: Date;
  priceCents: number;
  boughtAt: Date;
};

/**
 * Compras do utilizador na Fase 0 = entitlements ativos (PPV), com o evento.
 * Bilhetes físicos chegam com a Frente D. Mais recentes primeiro.
 */
export async function listUserPurchases(userId: string): Promise<Purchase[]> {
  return db
    .select({
      entitlementId: entitlements.id,
      eventId: events.id,
      eventTitle: events.title,
      startsAt: events.startsAt,
      priceCents: events.priceCents,
      boughtAt: entitlements.createdAt,
    })
    .from(entitlements)
    .innerJoin(events, eq(entitlements.eventId, events.id))
    .where(and(eq(entitlements.userId, userId), eq(entitlements.status, "active")))
    .orderBy(desc(entitlements.createdAt));
}

/**
 * Guarda a referência da Eupago na compra pendente, logo a seguir a criá-la.
 *
 * Antes só se guardava quando o webhook chegava — e por isso, quando o webhook
 * NÃO chegava, ficávamos sem nada por onde procurar a transação. Foi exatamente
 * o que aconteceu no primeiro teste em sandbox: pagamento criado do lado da
 * Eupago, nada do nosso lado a apontar-lhe.
 *
 * Guardar à cabeça serve duas coisas: dá com que reconciliar uma compra cujo
 * webhook se perdeu, e dá o número que se dita ao suporte da Eupago. O webhook
 * escreve por cima com o mesmo valor — é a mesma referência.
 *
 * Carimba SEMPRE a hora, mesmo quando a Eupago não devolve referência: a hora é
 * o que fecha a janela contra cobranças repetidas (ver `hasLiveCharge`), e essa
 * guarda não pode depender de um campo opcional da resposta deles.
 *
 * Nunca deixa a compra cair por causa disto: sem referência a compra continua
 * de pé (o `identifier` chega para o webhook a activar), só fica mais difícil
 * de investigar. Falhar aqui seria pior do que o problema que resolve.
 */
export async function recordChargeReference(
  kind: "entitlement" | "ticket",
  id: string,
  reference: string | null,
): Promise<void> {
  const table = kind === "entitlement" ? entitlements : tickets;
  try {
    await db
      .update(table)
      .set({
        chargeRequestedAt: new Date(),
        ...(reference ? { providerRef: reference } : {}),
      })
      .where(eq(table.id, id));
  } catch (error) {
    console.error(`[compras] não carimbei a cobrança de ${kind} ${id}:`, error);
  }
}

/**
 * Janela em que uma cobrança MB WAY já pedida ainda conta como viva.
 *
 * São os 5 minutos que a Eupago dá ao cliente para aceitar na app, mais uma
 * folga curta para o relógio dos dois lados não discordar na fronteira.
 */
const CHARGE_WINDOW_MS = 5.5 * 60 * 1000;

/**
 * Já pedimos uma cobrança para esta compra há pouco tempo?
 *
 * A compra pendente é reutilizada a cada tentativa — e bem, senão acumulavam-se
 * linhas e, nos bilhetes, lugares presos. Mas a COBRANÇA não pode ser
 * reutilizada às cegas: viu-se em sandbox três pedidos MB WAY de 7,50 € com o
 * mesmo identificador, um por clique. Em produção isso é o cliente a receber
 * três notificações, aceitar duas, e pagar duas vezes o mesmo acesso.
 *
 * Passada a janela, pedir de novo é legítimo: a anterior expirou do lado deles.
 */
export async function hasLiveCharge(kind: PurchaseKind, id: string): Promise<boolean> {
  const table = kind === "entitlement" ? entitlements : tickets;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(eq(table.id, id), gt(table.chargeRequestedAt, new Date(Date.now() - CHARGE_WINDOW_MS))),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Reserva, de forma ATÓMICA, o direito de criar UMA cobrança para esta compra.
 *
 * É o `hasLiveCharge` feito guarda em vez de pergunta. Ler "há cobrança viva?" e
 * agir a seguir não chega: dois cliques simultâneos liam ambos "não há" e
 * cobravam os dois — medido, 11 em 12 rondas a cobrar a dobrar. Aqui a condição
 * da janela e o carimbo vão no MESMO `UPDATE`: o Postgres tranca a linha,
 * serializa os pedidos, e só o primeiro encontra a janela aberta. O segundo vê
 * o carimbo que o primeiro acabou de pôr e não mexe em nada. É a mesma correção
 * do último dono e dos eventos duplicados — a guarda vive dentro da escrita.
 *
 * Devolve `true` a quem ganhou o slot (pode falar com a Eupago) e `false` a quem
 * chegou tarde (recusa com 409). Passada a janela, o slot volta a estar livre.
 */
export async function reserveCharge(kind: PurchaseKind, id: string): Promise<boolean> {
  const table = kind === "entitlement" ? entitlements : tickets;
  const [row] = await db
    .update(table)
    .set({ chargeRequestedAt: new Date() })
    .where(
      and(
        eq(table.id, id),
        or(
          isNull(table.chargeRequestedAt),
          lt(table.chargeRequestedAt, new Date(Date.now() - CHARGE_WINDOW_MS)),
        ),
      ),
    )
    .returning({ id: table.id });
  return Boolean(row);
}

/**
 * Devolve o slot que `reserveCharge` reservou, quando a cobrança acabou por não
 * acontecer — a Eupago falhou, ou a prova de consentimento falhou antes dela.
 *
 * Sem isto, uma falha prendia a retentativa durante toda a janela por nada: a
 * pessoa via um erro e não podia voltar a tentar durante 5,5 minutos. Só o
 * pedido que GANHOU a reserva chega aqui (os outros já receberam 409), por isso
 * repor o carimbo a NULL é seguro — não há outra reserva a atropelar.
 */
export async function releaseCharge(kind: PurchaseKind, id: string): Promise<void> {
  const table = kind === "entitlement" ? entitlements : tickets;
  try {
    await db.update(table).set({ chargeRequestedAt: null }).where(eq(table.id, id));
  } catch (error) {
    console.error(`[compras] não libertei a reserva de ${kind} ${id}:`, error);
  }
}

/* ------------------------------------------------------------------ *
 * DINHEIRO EM RISCO — as compras que ficaram a meio
 *
 * Uma compra pendente é dinheiro por fechar: ou está a decorrer, ou alguém
 * pagou e não recebeu nada, ou a cobrança nunca chegou a ser criada. Até aqui
 * não havia onde ver nenhum dos três — uma liga que venda 200 bilhetes ficava
 * a saber pelas reclamações.
 *
 * A REFERÊNCIA DA EUPAGO É O PONTO TODO DESTE ECRÃ. É o número que se dita ao
 * suporte deles para perguntar "esta foi paga?". Sem ela, uma compra pendente é
 * uma linha sem saída.
 * ------------------------------------------------------------------ */

/**
 * Em que pé ficou a compra. Derivado da hora da cobrança, não guardado: a
 * verdade sobre se uma referência MB WAY ainda está viva é o relógio, e uma
 * coluna com isto escrito ficava desatualizada no minuto seguinte.
 */
export type PurchaseRisk =
  /** Cobrança pedida há pouco — a pessoa ainda está a confirmar na app. */
  | "aberta"
  /** A janela MB WAY fechou e continua por pagar. É onde se pergunta à Eupago. */
  | "expirada"
  /** Compra criada e cobrança nunca pedida: o pedido à Eupago falhou. */
  | "sem-cobranca";

export type PurchaseAtRisk = {
  kind: PurchaseKind;
  id: string;
  risco: PurchaseRisk;
  channelId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  amountCents: number;
  /** A referência da Eupago. NULL quando a cobrança nunca chegou a existir. */
  providerRef: string | null;
  chargeRequestedAt: Date | null;
  /** Quando é que a reconciliação perguntou por esta compra pela última vez. */
  reconciledAt: Date | null;
  createdAt: Date;
};

/**
 * Teto da lista. Um evento esgotado deixa dezenas de carrinhos abandonados e a
 * página é para ler, não para percorrer: as mais recentes é que interessam.
 */
const AT_RISK_LIMIT = 200;

function riskOf(chargeRequestedAt: Date | null, agora: number): PurchaseRisk {
  if (!chargeRequestedAt) return "sem-cobranca";
  return agora - chargeRequestedAt.getTime() < CHARGE_WINDOW_MS ? "aberta" : "expirada";
}

/**
 * As compras pendentes dos canais deste âmbito, das mais recentes para trás.
 *
 * O `innerJoin` a `events` está lá pelo âmbito, e não por conveniência: é o que
 * impede o dono do canal A de ver o dinheiro (e o email dos compradores) do
 * canal B. `inScope` devolve `false` para quem não gere canal nenhum — zero
 * linhas, nunca "sem filtro". É a mesma regra de `server/stats.ts`.
 *
 * Duas queries e um merge, e não uma união em SQL: as duas tabelas guardam o
 * preço em sítios diferentes (o acesso vale o preço do evento, o bilhete tem o
 * seu) e uma união obrigava a alinhar colunas à mão de cada vez que uma delas
 * mudasse. Os volumes são de dezenas.
 */
export async function listPurchasesAtRisk(scope: ChannelScope): Promise<PurchaseAtRisk[]> {
  const pendente = (table: typeof entitlements | typeof tickets) =>
    and(eq(table.status, "pending"), inScope(events.channelId, scope));

  const [acessos, bilhetes] = await Promise.all([
    db
      .select({
        id: entitlements.id,
        channelId: events.channelId,
        eventTitle: events.title,
        buyerName: user.name,
        buyerEmail: user.email,
        amountCents: events.priceCents,
        providerRef: entitlements.providerRef,
        chargeRequestedAt: entitlements.chargeRequestedAt,
        reconciledAt: entitlements.reconciledAt,
        createdAt: entitlements.createdAt,
      })
      .from(entitlements)
      .innerJoin(events, eq(entitlements.eventId, events.id))
      .innerJoin(user, eq(entitlements.userId, user.id))
      .where(pendente(entitlements))
      .orderBy(desc(entitlements.createdAt))
      .limit(AT_RISK_LIMIT),
    db
      .select({
        id: tickets.id,
        channelId: events.channelId,
        eventTitle: events.title,
        buyerName: user.name,
        buyerEmail: user.email,
        amountCents: tickets.priceCents,
        providerRef: tickets.providerRef,
        chargeRequestedAt: tickets.chargeRequestedAt,
        reconciledAt: tickets.reconciledAt,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(user, eq(tickets.userId, user.id))
      .where(pendente(tickets))
      .orderBy(desc(tickets.createdAt))
      .limit(AT_RISK_LIMIT),
  ]);

  const agora = Date.now();
  return [
    ...acessos.map((r) => ({ ...r, kind: "entitlement" as const })),
    ...bilhetes.map((r) => ({ ...r, kind: "ticket" as const })),
  ]
    .map((r) => ({ ...r, risco: riskOf(r.chargeRequestedAt, agora) }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, AT_RISK_LIMIT);
}
