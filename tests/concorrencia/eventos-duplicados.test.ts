import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A Cloudflare fica de fora do teste: `createEvent` provisiona lá um live input
 * e isso é uma chamada HTTP a terceiros que não tem lugar numa suite. O que se
 * mede aqui é a GUARDA DE DUPLICADOS, que corre toda dentro da transação, antes
 * de a Cloudflare sequer ser chamada. O mock devolve um uid qualquer e conta
 * quantas vezes foi chamado — que é, por si, um sinal: uma chamada por evento
 * REALMENTE criado, nunca uma por pedido.
 *
 * O mock é declarado antes de importar o código que o usa (o `vi.mock` é içado
 * para o topo pelo Vitest, mas manter o import a seguir deixa a intenção clara).
 */
const createLiveInputMock = vi.fn(async () => ({
  uid: `cf-${crypto.randomUUID()}`,
  rtmpsUrl: "rtmps://exemplo/live",
  streamKey: "chave",
}));
vi.mock("@/lib/cloudflare", () => ({ createLiveInput: createLiveInputMock }));

const { events } = await import("@/db/schema");
const { createEvent } = await import("@/server/events");
const { db, limparBase, temBaseDeDados } = await import("../apoio/base-de-dados");
const { criarCanal } = await import("../apoio/fabrica");
const { cumpridos, emParalelo } = await import("../apoio/paralelo");

/*
 * ============================================================================
 *  O MESMO EVENTO PEDIDO OITO VEZES DÁ UM EVENTO
 * ============================================================================
 *
 * PORQUE É QUE ISTO CUSTA DINHEIRO
 *
 * Cada evento criado provisiona um live input na Cloudflare, que se paga. O
 * duplo-clique de um dono nervoso, ou o browser a repetir um POST, não pode
 * virar oito live inputs a faturar em paralelo — foi o que encheu a conta de
 * eventos "TESTE".
 *
 * PORQUE É QUE A CONDIÇÃO NO `where` NÃO CHEGAVA (e foi medido)
 *
 * O código antigo lia "já existe este título?" e, se não, inseria. Entre a
 * leitura e a escrita não há atomicidade: em READ COMMITTED, oito pedidos
 * simultâneos não veem as linhas por confirmar uns dos outros e concluem TODOS
 * que são o primeiro. Medição original: 20 rondas de 8 pedidos deixaram 153
 * eventos onde deviam ficar 20 — só a primeira ronda (servidor frio) se safou.
 *
 * O que segura é o `pg_advisory_xact_lock` sobre uma chave derivada de
 * canal+título+hora: os pedidos do MESMO evento fazem fila, os de eventos
 * diferentes não se estorvam. Este teste põe os oito a partir juntos (ver a
 * barreira em `tests/apoio/paralelo.ts`) e exige exatamente um evento.
 */

const PEDIDOS_SIMULTANEOS = 8;
const RONDAS = 10;

/** Um rascunho válido, sem bilhetes de porta — o caso mínimo que a guarda vê. */
function rascunhoDe(title: string, startsAt: string) {
  return {
    title,
    startsAt: new Date(startsAt),
    priceCents: 750,
    ticketPriceCents: null,
    ticketCapacity: null,
  };
}

describe.skipIf(!temBaseDeDados())("guarda de duplicados de eventos", () => {
  beforeEach(async () => {
    await limparBase();
    createLiveInputMock.mockClear();
  });

  it(`${PEDIDOS_SIMULTANEOS} pedidos do mesmo evento dão 1 evento (${RONDAS} rondas)`, async () => {
    const contagens: number[] = [];

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const canal = await criarCanal();
      const rascunho = rascunhoDe(`Final da Época ${ronda}`, "2026-09-01T20:00:00.000Z");

      await emParalelo(PEDIDOS_SIMULTANEOS, () => createEvent(rascunho, canal.id));

      const linhas = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.channelId, canal.id), eq(events.title, rascunho.title)));
      contagens.push(linhas.length);
    }

    // Uma entrada por ronda, todas com valor 1. Ver a lista inteira facilita o
    // diagnóstico: se falhar, diz-se logo QUANTOS a mais e em que ronda.
    expect(contagens).toEqual(Array(RONDAS).fill(1));
  });

  it("provisiona a Cloudflare uma só vez, não uma por pedido", async () => {
    const canal = await criarCanal();
    const rascunho = rascunhoDe("Clássico", "2026-10-01T20:00:00.000Z");

    await emParalelo(PEDIDOS_SIMULTANEOS, () => createEvent(rascunho, canal.id));

    expect(createLiveInputMock).toHaveBeenCalledTimes(1);
  });

  it("marca como reaproveitados todos os pedidos menos um", async () => {
    const canal = await criarCanal();
    const rascunho = rascunhoDe("Dérbi", "2026-11-01T20:00:00.000Z");

    const resultados = cumpridos(
      await emParalelo(PEDIDOS_SIMULTANEOS, () => createEvent(rascunho, canal.id)),
    );

    expect(resultados.filter((r) => !r.reused)).toHaveLength(1);
    expect(resultados.filter((r) => r.reused)).toHaveLength(PEDIDOS_SIMULTANEOS - 1);
    // Todos devolvem o MESMO id — é o mesmo evento.
    expect(new Set(resultados.map((r) => r.id)).size).toBe(1);
  });

  /*
   * Dois canais com um evento de nome igual à mesma hora são DOIS eventos, com
   * todo o direito: duas ligas podem ter, cada uma, o seu "Final da Época". Se
   * a guarda os confundisse, uma liga via o evento da outra a desaparecer-lhe
   * debaixo dos pés. O canal entra na chave do lock precisamente por isto.
   */
  it("não confunde eventos de canais diferentes com o mesmo título", async () => {
    const [canalA, canalB] = await Promise.all([criarCanal(), criarCanal()]);
    const rascunho = rascunhoDe("Final da Época", "2026-12-01T20:00:00.000Z");

    await Promise.all([createEvent(rascunho, canalA.id), createEvent(rascunho, canalB.id)]);

    for (const canal of [canalA, canalB]) {
      const linhas = await db.select().from(events).where(eq(events.channelId, canal.id));
      expect(linhas).toHaveLength(1);
    }
  });
});
