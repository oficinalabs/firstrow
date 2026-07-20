import { createHash } from "node:crypto";
import { and, count, desc, eq, gte, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, events, tickets } from "@/db/schema";
import { createLiveInput } from "@/lib/cloudflare";
import {
  DUPLICATE_WINDOW_MS,
  type EventCommitments,
  type EventDraft,
  type EventFieldErrors,
  eventEditRules,
  eventToDraft,
  isEventStatus,
} from "@/lib/event-rules";
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
 * A Cloudflare não deu o live input.
 *
 * Existe para quem chama poder DIZER isso, em vez de "algo correu mal": o dono
 * que lê "o serviço de streaming não respondeu" sabe que não é culpa do que
 * escreveu e que tentar outra vez daqui a pouco é a coisa certa a fazer.
 *
 * Guarda a causa original — o `console.error` do lado de quem apanha continua a
 * levar o erro verdadeiro para os logs.
 */
export class StreamProvisionError extends Error {
  constructor(cause: unknown) {
    super("Cloudflare não devolveu o live input.", { cause });
    this.name = "StreamProvisionError";
  }
}

/** Como é que uma falha de gravação se explica a quem está no ecrã. */
export type SaveFailure = { code: "stream" | "unknown"; message: string };

/**
 * Traduz o que rebentou para uma frase e um código.
 *
 * Está aqui, ao pé de quem atira, para a server action e a rota de API dizerem
 * exactamente a mesma coisa — e para acrescentar um caso novo ser um sítio só.
 */
export function describeSaveFailure(error: unknown): SaveFailure {
  if (error instanceof StreamProvisionError) {
    return {
      code: "stream",
      message:
        "O serviço de streaming (Cloudflare) não respondeu. Não ficou nada a meio nem nada a contar na fatura — tenta outra vez daqui a pouco.",
    };
  }
  return {
    code: "unknown",
    message: "Não deu para gravar. Espera um momento e tenta outra vez.",
  };
}

/**
 * A chave do lock deste evento: o mesmo canal + título + hora dá sempre o mesmo
 * número, e eventos diferentes dão números diferentes (logo, não esperam uns
 * pelos outros).
 *
 * Calculada aqui e não com o `hashtext()` do Postgres de propósito: essa função
 * é interna, não documentada, e o valor dela pode mudar entre versões.
 *
 * O separador entre os campos é preciso: sem ele, título "ab" + hora "c" dava a
 * mesma chave que título "a" + hora "bc", e dois eventos diferentes ficavam à
 * espera um do outro sem razão.
 *
 * E é escrito como ESCAPE, não como o byte cru. O byte cru corre exatamente
 * igual, mas torna este ficheiro binário aos olhos do git: deixa de haver diff,
 * e um conflito de merge aqui passa a ser irresolúvel sem ferramentas à parte.
 * Aconteceu — não voltes a trocá-lo pelo carácter literal.
 */
function duplicateLockKey(draft: EventDraft, channelId: string): string {
  const digest = createHash("sha256")
    .update(`${channelId}\u0000${draft.title}\u0000${draft.startsAt.toISOString()}`)
    .digest();
  // int8 COM SINAL — é o que o pg_advisory_xact_lock aceita.
  return digest.readBigInt64BE(0).toString();
}

/**
 * Cria o evento como rascunho e provisiona o live input na Cloudflare (o
 * destino do OBS). Recebe um rascunho **já validado** — ver lib/event-rules.ts.
 *
 * Três defesas contra o que encheu a conta de eventos "TESTE":
 *
 *  1. Guarda de duplicados — o mesmo título à mesma hora pedido outra vez
 *     dentro da janela devolve o evento que já existe, em vez de provisionar
 *     (e pagar) um segundo live input.
 *  2. A linha entra na BD ANTES de falarmos com a Cloudflare, para que uma
 *     falha da Cloudflare deixe uma linha nossa para limpar em vez de um live
 *     input órfão a custar dinheiro.
 *  3. Ler e escrever acontecem dentro do MESMO lock. Ver abaixo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE HÁ UM LOCK, E PORQUE É QUE ANTES NÃO CHEGAVA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Dizia-se aqui que pôr o INSERT antes da Cloudflare fechava a janela dos
 * pedidos em paralelo, e que só sobrava a hipótese de dois coincidirem "nos
 * poucos milissegundos entre a leitura e a escrita". **Foi medido e é falso.**
 * Com o servidor quente, 20 rondas de 8 pedidos em paralelo com o mesmo título
 * deixaram **153 eventos** onde deviam ficar 20: em 19 das 20 rondas passaram
 * os 8. O SELECT seguido de INSERT não é atómico — em READ COMMITTED nenhum dos
 * oito vê as linhas por confirmar dos outros sete, e todos concluem que são o
 * primeiro. A única ronda que se safou foi a primeira, com o servidor frio, em
 * que o arranque atrasou os outros o suficiente.
 *
 * (É a mesma lição do invariante "um canal nunca fica sem dono": uma condição
 * dentro do `where` não serializa nada.)
 *
 * O `pg_advisory_xact_lock` serializa só os pedidos **deste** evento — dois
 * eventos diferentes têm chaves diferentes e não esperam um pelo outro. É
 * transacional, por isso larga sozinho no commit ou no rollback; não há lock
 * pendurado se algo rebentar. A chamada à Cloudflare fica FORA da transação: um
 * lock à espera de uma HTTP de terceiros era trocar um problema por outro.
 *
 * Nova medição, mesmo teste: 160 pedidos → 20 eventos, 0 duplicados.
 */
export async function createEvent(draft: EventDraft, channelId: string): Promise<CreatedEvent> {
  const claimed = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${duplicateLockKey(draft, channelId)}::bigint)`,
    );

    const [duplicate] = await tx
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
    if (duplicate) return { id: duplicate.id, reused: true };

    const id = newId();
    await tx.insert(events).values({
      id,
      channelId,
      title: draft.title,
      description: draft.description,
      startsAt: draft.startsAt,
      priceCents: draft.priceCents,
      ticketPriceCents: draft.ticketPriceCents,
      ticketCapacity: draft.ticketCapacity,
      status: "draft",
    });
    return { id, reused: false };
  });

  if (claimed.reused) {
    console.info(`[events] pedido duplicado de "${draft.title}" — devolvido ${claimed.id}.`);
    return claimed;
  }

  const { id } = claimed;

  /*
   * A partir daqui há DUAS coisas que podem falhar, e confundi-las custava
   * dinheiro. O `catch` único que aqui estava apanhava as duas e apagava a nossa
   * linha em ambos os casos:
   *
   *   1. a Cloudflare não cria o live input → não há nada lá; apagar a nossa
   *      linha é a limpeza certa;
   *   2. a Cloudflare CRIA o live input e é o nosso UPDATE que falha → apagar a
   *      nossa linha deixava exactamente o input órfão a contar na fatura que
   *      esta ordem de operações veio evitar, e sem ninguém a saber o uid.
   *
   * Separados: no caso 2 temos o uid em mão e desfazemos o que criámos lá.
   */
  let liveInput: Awaited<ReturnType<typeof createLiveInput>>;
  try {
    liveInput = await createLiveInput(draft.title);
  } catch (error) {
    await forget(id);
    throw new StreamProvisionError(error);
  }

  try {
    await db
      .update(events)
      .set({ cfLiveInputId: liveInput.uid, updatedAt: new Date() })
      .where(eq(events.id, id));
  } catch (error) {
    // A ordem importa: primeiro largar o que está a contar na fatura deles.
    await deleteLiveInput(liveInput.uid);
    await forget(id);
    throw error;
  }

  return { id, reused: false };
}

/**
 * Apaga a linha que acabámos de criar, depois de o provisionamento falhar.
 *
 * Nunca atira: se esta limpeza rebentar, o erro que interessa é o ORIGINAL — o
 * que explica porque é que o evento não nasceu. Trocá-lo pelo da limpeza deixava
 * o dono a ler uma mensagem sobre uma coisa que ele nem sabe que aconteceu.
 */
async function forget(id: string): Promise<void> {
  try {
    await db.delete(events).where(eq(events.id, id));
  } catch (error) {
    console.error(`[events] evento ${id} ficou sem stream e não deu para o limpar:`, error);
  }
}

/**
 * Volta a pedir o live input a um evento que ficou sem ele.
 *
 * Existe por causa de um beco: um evento sem `cf_live_input_id` não transmite, e
 * a única cura era apagá-lo e criar outro — mas apagar RECUSA quando já houve
 * vendas. Um evento vendido que falhasse o provisionamento ficava morto, sem
 * saída nenhuma no backoffice.
 *
 * Recusa se já houver stream: pedir uma segunda deixava a primeira órfã na conta
 * da Cloudflare e as credenciais que o OBS já tem deixavam de servir.
 */
export async function provisionLiveInput(eventId: string): Promise<{ ok: boolean }> {
  const event = await getEvent(eventId);
  if (!event) return { ok: false };
  if (event.cfLiveInputId) return { ok: true };

  const liveInput = await createLiveInput(event.title).catch((error) => {
    throw new StreamProvisionError(error);
  });

  /*
   * A condição no `where` não é decoração: entre a leitura acima e esta escrita,
   * outro pedido pode ter provisionado. Sem ela, o último a escrever ganhava e o
   * live input do outro ficava a contar na fatura sem nada a apontar-lhe.
   */
  const [updated] = await db
    .update(events)
    .set({ cfLiveInputId: liveInput.uid, updatedAt: new Date() })
    .where(and(eq(events.id, eventId), sql`${events.cfLiveInputId} is null`))
    .returning({ id: events.id });

  if (!updated) {
    await deleteLiveInput(liveInput.uid);
    console.info(`[events] ${eventId} já tinha stream — o input agora a mais foi largado.`);
  }
  return { ok: true };
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

/** Quem faz as queries: a base, ou uma transação a decorrer. */
type Reader = Pick<typeof db, "select">;

/**
 * O que este evento já tem agarrado a si — é isto que fecha campos ao editar
 * (ver `eventEditRules` em lib/event-rules.ts).
 *
 * **Um PPV pendente conta.** Não é pedantismo: a cobrança MB WAY é criada com o
 * preço que estava em vigor (`app/api/checkout/[eventId]`), mas o recibo é
 * montado quando o webhook chega e vai buscar `events.price_cents` OUTRA VEZ. Se
 * o preço mudasse entretanto, a pessoa pagava 7,50 € e recebia um recibo de
 * 12,00 €. Contar só os ativos deixava essa janela aberta de par em par.
 *
 * Nos bilhetes é ao contrário — `tickets.price_cents` é uma cópia por bilhete —
 * por isso aqui só contam os que estão mesmo na mão de alguém (emitido ou
 * usado). Um pendente que nunca pague não pode prender a configuração do evento
 * para sempre. A definição de "vendido" é a de `getEventTicketStats`
 * (server/tickets.ts); se lá mudar, tem de mudar aqui.
 */
export async function readCommitments(
  eventId: string,
  status: string,
  reader: Reader = db,
): Promise<EventCommitments> {
  const [[ppv], [door]] = await Promise.all([
    reader.select({ n: count() }).from(entitlements).where(eq(entitlements.eventId, eventId)),
    reader
      .select({ n: count() })
      .from(tickets)
      .where(and(eq(tickets.eventId, eventId), inArray(tickets.status, ["issued", "used"]))),
  ]);

  return {
    // Um estado que o código não conhece cai no mais fechado que existe: um
    // rascunho abre campos, e abrir campos por causa de um valor estranho na
    // coluna era o erro a cair para o lado errado.
    status: isEventStatus(status) ? status : "ended",
    ppvSales: ppv?.n ?? 0,
    ticketsSold: door?.n ?? 0,
  };
}

export type UpdateEventResult =
  | { ok: true }
  | { ok: false; reason: "not-found" }
  /** Uma venda entrou entre o ecrã e a gravação — o campo fechou-se pelo caminho. */
  | { ok: false; reason: "locked"; errors: EventFieldErrors };

/**
 * Grava as alterações a um evento.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE ISTO VOLTA A VERIFICAR O QUE A ACTION JÁ VERIFICOU
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A action lê as vendas, monta as regras e valida o formulário contra elas. Tudo
 * isso acontece FORA de qualquer transação e antes desta chamada — ou seja, é a
 * fotografia de um instante que já passou. Entre a fotografia e a escrita cabe
 * uma compra: alguém carrega em "Pagar com MB WAY" enquanto o dono carrega em
 * "Guardar alterações", e o preço muda por baixo de uma compra que já arrancou
 * com o preço antigo.
 *
 * É a MESMA lição que a guarda de duplicados aprendeu à custa de 153 eventos
 * onde deviam ficar 20: ler e escrever em passos separados não é atómico, e uma
 * condição no `where` não serializa nada.
 *
 * A serialização aqui é o `for update` sobre a linha do evento, e funciona por
 * uma propriedade do Postgres que vale a pena ter escrita: **inserir numa tabela
 * que aponta para esta agarra um `FOR KEY SHARE` na linha apontada**, e o
 * `FOR KEY SHARE` é incompatível com o `FOR UPDATE`. Logo:
 *
 *   - se a compra chegar primeiro, o nosso `for update` espera por ela e a
 *     contagem lá dentro já a vê;
 *   - se nós chegarmos primeiro, o INSERT dela espera pelo nosso commit e o
 *     preço que ela lê é o novo.
 *
 * Nunca há um estado em que o preço mudou E existe uma compra feita ao preço
 * antigo. Medido — ver o relatório desta frente.
 *
 * (O que isto NÃO serializa: um bilhete a passar de `pending` a `issued`, que é
 * um UPDATE noutra tabela e não toca nesta linha. Sem consequência: o preço do
 * bilhete é copiado por bilhete, e a lotação é validada outra vez na compra.)
 */
export async function updateEvent(eventId: string, draft: EventDraft): Promise<UpdateEventResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)
      .for("update");
    if (!row) return { ok: false, reason: "not-found" };

    const rules = eventEditRules(await readCommitments(eventId, row.status, tx));
    const stored = eventToDraft(row);

    // O veredito que conta. Se uma venda entrou pelo caminho, o campo que ela
    // fecha volta com a razão — a mesma frase que o ecrã já mostrava.
    const errors: EventFieldErrors = {};
    if (rules.startsAt && draft.startsAt.getTime() !== stored.startsAt.getTime()) {
      errors.startsAt = rules.startsAt;
    }
    if (rules.price && draft.priceCents !== stored.priceCents) {
      errors.price = rules.price;
    }
    if (rules.ticketsOff && draft.ticketPriceCents === null) {
      errors.ticketPrice = rules.ticketsOff;
    }
    if (draft.ticketCapacity !== null && draft.ticketCapacity < rules.minCapacity) {
      errors.ticketCapacity = `Já foram vendidos ${rules.minCapacity} bilhetes — a lotação não pode ficar abaixo disso.`;
    }
    if (Object.keys(errors).length > 0) return { ok: false, reason: "locked", errors };

    await tx
      .update(events)
      .set({
        title: draft.title,
        // A descrição não fecha com as vendas: adiar um evento tem consequências
        // para quem pagou, corrigir o texto que o descreve não tem nenhuma.
        description: draft.description,
        startsAt: draft.startsAt,
        priceCents: draft.priceCents,
        ticketPriceCents: draft.ticketPriceCents,
        ticketCapacity: draft.ticketCapacity,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));

    return { ok: true };
  });
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
 *
 * ⚠️ CONTAR E APAGAR TÊM DE SER O MESMO PASSO. Estavam separados, e entre um e
 * outro cabia uma compra: a contagem dava zero, alguém pagava, e o `delete`
 * levava atrás — por cascade, em silêncio — o registo dessa pessoa. É a mesma
 * classe de bug da guarda de duplicados, e fecha-se da mesma maneira: o
 * `for update` sobre a linha do evento serializa-se contra o INSERT da compra
 * (que agarra um `FOR KEY SHARE` na linha apontada). Ver `updateEvent`.
 */
export async function deleteEvent(id: string): Promise<DeleteEventResult> {
  const event = await getEvent(id);
  if (!event) return { ok: false, reason: "not-found", sales: 0 };
  if (event.status === "live") return { ok: false, reason: "live", sales: 0 };

  /*
   * A Cloudflare fica FORA da transação, e antes dela: um lock de linha aberto à
   * espera de uma HTTP de terceiros travava as compras desse evento durante todo
   * o tempo que ela demorasse. O preço desta ordem é que uma recusa por vendas
   * chega depois de o live input já ter saído — mas essa recusa só acontece se
   * uma compra entrar exactamente nesta janela, e ficar com um evento sem stream
   * é melhor do que ficar sem o registo de quem pagou.
   */
  if (event.cfLiveInputId && !(await deleteLiveInput(event.cfLiveInputId))) {
    return { ok: false, reason: "cloudflare", sales: 0 };
  }

  const result = await db.transaction(async (tx): Promise<DeleteEventResult> => {
    const [row] = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, id))
      .for("update");
    if (!row) return { ok: false, reason: "not-found", sales: 0 };

    const [[ppv], [door]] = await Promise.all([
      tx.select({ n: count() }).from(entitlements).where(eq(entitlements.eventId, id)),
      tx.select({ n: count() }).from(tickets).where(eq(tickets.eventId, id)),
    ]);
    const sales = (ppv?.n ?? 0) + (door?.n ?? 0);
    if (sales > 0) return { ok: false, reason: "has-sales", sales };

    await tx.delete(events).where(eq(events.id, id));
    return { ok: true };
  });

  if (result.ok) console.info(`[events] "${event.title}" (${id}) apagado.`);
  return result;
}
