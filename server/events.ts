import { and, count, desc, eq, gte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, events, tickets } from "@/db/schema";
import { createLiveInput } from "@/lib/cloudflare";
import { DUPLICATE_WINDOW_MS, type EventDraft } from "@/lib/event-rules";
import { newId } from "@/lib/ids";
import { type ChannelScope, inScope } from "@/server/authz";
import { deleteLiveInput } from "@/server/cloudflare-stream";

/**
 * Traduz um âmbito de canais para a condição SQL que TODAS as queries de
 * EVENTOS do backoffice têm de levar.
 *
 * A regra em si — sobretudo o caso da lista vazia, que tem de dar ZERO linhas e
 * não "sem filtro" — vive em `inScope` (server/authz.ts), a par dos âmbitos que
 * a produzem. Isto é só o atalho para a coluna desta tabela, que é a que quase
 * toda a gente daqui quer.
 */
export function inChannelScope(scope: ChannelScope): SQL | undefined {
  return inScope(events.channelId, scope);
}

export type CreatedEvent = {
  id: string;
  /** `true` quando o pedido caiu na guarda de duplicados e reaproveitou o evento. */
  reused: boolean;
};

/**
 * Cria o evento como rascunho e provisiona o live input na Cloudflare (o
 * destino do OBS). Recebe um rascunho **já validado** — ver lib/event-rules.ts.
 *
 * Duas defesas contra o que encheu a conta de eventos "TESTE":
 *
 *  1. Guarda de duplicados — o mesmo título à mesma hora pedido outra vez
 *     dentro da janela devolve o evento que já existe, em vez de provisionar
 *     (e pagar) um segundo live input.
 *  2. A linha entra na BD ANTES de falarmos com a Cloudflare. Fecha a janela de
 *     ~1s em que dois pedidos em paralelo passavam ambos pela guarda, e faz com
 *     que uma falha da Cloudflare deixe uma linha nossa para limpar em vez de
 *     um live input órfão a custar dinheiro.
 *
 * Sobra a hipótese de dois pedidos coincidirem nos poucos milissegundos entre a
 * leitura e a escrita. Para isso é que o botão desativa ao primeiro clique.
 */
export async function createEvent(draft: EventDraft, channelId: string): Promise<CreatedEvent> {
  const [duplicate] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        // O canal entra na guarda: duas ligas podem ter, com todo o direito, um
        // "Final da Época" à mesma hora — não é um duplo-clique, são dois eventos.
        eq(events.channelId, channelId),
        eq(events.title, draft.title),
        eq(events.startsAt, draft.startsAt),
        gte(events.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS)),
      ),
    )
    .limit(1);
  if (duplicate) {
    console.info(`[events] pedido duplicado de "${draft.title}" — devolvido ${duplicate.id}.`);
    return { id: duplicate.id, reused: true };
  }

  const id = newId();
  await db.insert(events).values({
    id,
    channelId,
    title: draft.title,
    startsAt: draft.startsAt,
    priceCents: draft.priceCents,
    status: "draft",
  });

  try {
    const liveInput = await createLiveInput(draft.title);
    await db
      .update(events)
      .set({ cfLiveInputId: liveInput.uid, updatedAt: new Date() })
      .where(eq(events.id, id));
  } catch (error) {
    await db.delete(events).where(eq(events.id, id));
    throw error;
  }

  return { id, reused: false };
}

export async function getEvent(id: string) {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Todos os eventos da plataforma, de todos os canais.
 *
 * É para as superfícies PÚBLICAS — a visão geral em "/" e o arquivo — onde
 * mostrar tudo é o objetivo. O backoffice usa `listEventsInScope`: lá, ver
 * tudo é a fuga.
 */
export async function listEvents() {
  return db.select().from(events).orderBy(desc(events.startsAt));
}

/** Os eventos de um canal — a página pública `/canal/[slug]`. */
export async function listEventsByChannel(channelId: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.channelId, channelId))
    .orderBy(desc(events.startsAt));
}

/** Os eventos sobre os quais este utilizador tem alguma coisa a dizer. */
export async function listEventsInScope(scope: ChannelScope) {
  return db.select().from(events).where(inChannelScope(scope)).orderBy(desc(events.startsAt));
}

/**
 * Quantas compras estão agarradas a cada evento (acessos PPV + bilhetes de
 * porta), incluindo as reembolsadas: continuam a ser o registo de quem pagou.
 * É isto que decide se um evento ainda pode ser apagado.
 */
export async function countSalesByEvent(scope: ChannelScope): Promise<Map<string, number>> {
  const where = inChannelScope(scope);
  const [ppv, door] = await Promise.all([
    db
      .select({ eventId: entitlements.eventId, n: count() })
      .from(entitlements)
      .innerJoin(events, eq(entitlements.eventId, events.id))
      .where(where)
      .groupBy(entitlements.eventId),
    db
      .select({ eventId: tickets.eventId, n: count() })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(where)
      .groupBy(tickets.eventId),
  ]);

  const sales = new Map<string, number>();
  for (const row of [...ppv, ...door]) {
    sales.set(row.eventId, (sales.get(row.eventId) ?? 0) + row.n);
  }
  return sales;
}

/** As compras de UM evento — a pergunta que `deleteEvent` faz antes de apagar. */
export async function countSalesForEvent(eventId: string): Promise<number> {
  const [[ppv], [door]] = await Promise.all([
    db.select({ n: count() }).from(entitlements).where(eq(entitlements.eventId, eventId)),
    db.select({ n: count() }).from(tickets).where(eq(tickets.eventId, eventId)),
  ]);
  return (ppv?.n ?? 0) + (door?.n ?? 0);
}

export type DeleteEventResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "live" | "has-sales" | "cloudflare"; sales: number };

/**
 * Apaga o evento, o live input na Cloudflare e o que estiver pendurado nele.
 *
 * Recusa em dois casos, e o ecrã diz porquê:
 *  - **no ar** — apagar por baixo de uma transmissão a decorrer não é engano
 *    que se desfaça; termina-se primeiro.
 *  - **com compras** — as FKs de `entitlements`/`tickets` estão em cascade, por
 *    isso apagar o evento levava atrás o registo de quem pagou. Um evento
 *    vendido termina, não desaparece.
 *
 * O live input sai primeiro: se a Cloudflare falhar, o evento fica de pé e o
 * dono tenta outra vez. Ao contrário, ficava exatamente o input órfão a custar
 * dinheiro que este botão veio resolver. As sessões de reprodução vão atrás do
 * evento por cascade.
 */
export async function deleteEvent(id: string): Promise<DeleteEventResult> {
  const event = await getEvent(id);
  if (!event) return { ok: false, reason: "not-found", sales: 0 };
  if (event.status === "live") return { ok: false, reason: "live", sales: 0 };

  const sales = await countSalesForEvent(id);
  if (sales > 0) return { ok: false, reason: "has-sales", sales };

  if (event.cfLiveInputId && !(await deleteLiveInput(event.cfLiveInputId))) {
    return { ok: false, reason: "cloudflare", sales: 0 };
  }

  await db.delete(events).where(eq(events.id, id));
  console.info(`[events] "${event.title}" (${id}) apagado.`);
  return { ok: true };
}
