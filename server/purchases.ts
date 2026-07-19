import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, events, tickets } from "@/db/schema";

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
export async function hasLiveCharge(kind: "entitlement" | "ticket", id: string): Promise<boolean> {
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
