import { beforeEach, describe, expect, it } from "vitest";
import type { ChannelScope } from "@/server/authz";
import {
  type EventForOperations,
  getPlatformEconomics,
  listEventsForOperations,
} from "@/server/stats";
import { limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import {
  criarCanal,
  criarEntitlement,
  criarEvento,
  criarSessao,
  criarUtilizador,
} from "../apoio/fabrica";

/*
 * ============================================================================
 *  A JANELA TEMPORAL DA ECONOMIA — e a agenda sem dinheiro
 * ============================================================================
 *
 * Dois fechos desta frente, medidos contra a base de dados:
 *
 *  1. `getPlatformEconomics` não tinha janela temporal. A dashboard tem seletor
 *     de período e este bloco somava desde o início — o mesmo ecrã dizia duas
 *     coisas sobre o mesmo intervalo, com quatro cartões lado a lado.
 *  2. A agenda (`/admin/agenda`) é a lista de eventos para quem só OPERA, e a
 *     query que a serve não pode trazer um número de dinheiro sequer.
 *
 * NENHUM valor esperado aqui é lido do código: todos são calculados à mão a
 * partir do cenário e escritos como literais. É a regra desta sessão — oito
 * vezes uma afirmação confiante foi desmentida por medição.
 */

const AGORA = new Date("2026-07-20T12:00:00Z");
const TODOS: ChannelScope = { all: true };

/*
 * ────────────────────────────────────────────────────────────────────────────
 *  O CENÁRIO, COM AS CONTAS FEITAS À MÃO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Dois eventos do mesmo canal, um DENTRO da janela de 30 dias e outro FORA
 * dela (mas dentro dos 12 meses). A janela de 30 dias a contar de 2026-07-20
 * abre a 2026-06-21 (meia-noite de Lisboa) — ver `periodStart`.
 *
 *   RECENTE  · 20,00 €  · compras e sessões a 2026-07-15  (dentro dos 30 dias)
 *       4 compras × 2000                    = 8000 de receita
 *       comissão 4 × round(200)             =  800
 *       2 sessões de 30 min cada            =   60 minutos
 *
 *   ANTIGO   · 10,00 €  · compras e sessões a 2026-03-10  (fora dos 30 dias)
 *       3 compras × 1000                    = 3000 de receita
 *       comissão 3 × round(100)             =  300
 *       1 sessão de 120 min                 =  120 minutos
 *
 * Custo de entrega: 1 $ por 1000 minutos, convertido a 0,92 €/$ (`DEFAULT_USD_TO_EUR`,
 * porque o `.env` de teste não define `USD_TO_EUR_RATE`).
 *
 *    60 min → round(60 × 1 × 100 / 1000) =  6 centavos USD → round(6 × 0,92) = 6 cêntimos EUR
 *   120 min → round(120 × 1 × 100 / 1000) = 12 centavos USD → round(12 × 0,92) = 11 cêntimos EUR
 *   180 min → round(180 × 1 × 100 / 1000) = 18 centavos USD → round(18 × 0,92) = 17 cêntimos EUR
 *
 * ⚠️  6 + 11 = 17 por acaso, e não por construção: o custo do total é calculado
 * evento a evento e SOMADO (ver `totalEconomics`), não recalculado sobre os 180
 * minutos. Com outros números os dois podiam divergir num cêntimo — é por isso
 * que os valores abaixo são escritos um a um e não derivados uns dos outros.
 */
const PRECO_RECENTE = 2000;
const PRECO_ANTIGO = 1000;
const DENTRO = new Date("2026-07-15T10:00:00Z");
const FORA = new Date("2026-03-10T10:00:00Z");

async function cenario() {
  const canal = await criarCanal();
  const recente = await criarEvento(canal.id, {
    title: "Batalha de julho",
    priceCents: PRECO_RECENTE,
    startsAt: DENTRO,
  });
  const antigo = await criarEvento(canal.id, {
    title: "Batalha de março",
    priceCents: PRECO_ANTIGO,
    startsAt: FORA,
  });

  for (let i = 0; i < 4; i += 1) {
    const pessoa = await criarUtilizador();
    await criarEntitlement(pessoa.id, recente.id, { status: "active", createdAt: DENTRO });
  }
  for (let i = 0; i < 3; i += 1) {
    const pessoa = await criarUtilizador();
    await criarEntitlement(pessoa.id, antigo.id, { status: "active", createdAt: FORA });
  }

  // Duas sessões de 30 minutos no evento recente; uma de 120 no antigo.
  for (let i = 0; i < 2; i += 1) {
    const pessoa = await criarUtilizador();
    await criarSessao(pessoa.id, recente.id, {
      startedAt: new Date("2026-07-15T21:00:00Z"),
      lastHeartbeatAt: new Date("2026-07-15T21:30:00Z"),
    });
  }
  const espectador = await criarUtilizador();
  await criarSessao(espectador.id, antigo.id, {
    startedAt: new Date("2026-03-10T21:00:00Z"),
    lastHeartbeatAt: new Date("2026-03-10T23:00:00Z"),
  });

  return { canal, recente, antigo };
}

describe.skipIf(!temBaseDeDados())("a janela temporal da economia", () => {
  beforeEach(limparBase);

  it("sem período, conta desde o início — o comportamento de `/admin/ganhos`", async () => {
    await cenario();
    const economia = await getPlatformEconomics(TODOS, null, AGORA);

    expect(economia.periodLabel).toBeNull();
    expect(economia.rows).toHaveLength(2);
    expect(economia.totals.revenueCents).toBe(8000 + 3000);
    expect(economia.totals.commissionCents).toBe(800 + 300);
    expect(economia.totals.minutes).toBe(60 + 120);
    expect(economia.totals.videoCostUsdCents).toBe(6 + 12);
    expect(economia.totals.videoCostEurCents).toBe(6 + 11);
    expect(economia.totals.marginCents).toBe(1100 - 17);
  });

  it("com 30 dias, fica só o que entrou nos 30 dias — ao cêntimo", async () => {
    const { recente } = await cenario();
    const economia = await getPlatformEconomics(TODOS, "30d", AGORA);

    // O evento antigo desaparece INTEIRO: sem compras nem sessões na janela,
    // não tem economia nenhuma para mostrar.
    expect(economia.rows).toHaveLength(1);
    expect(economia.rows[0]?.eventId).toBe(recente.id);
    expect(economia.periodLabel).toBe("30 dias");

    expect(economia.totals.revenueCents).toBe(8000);
    expect(economia.totals.commissionCents).toBe(800);
    expect(economia.totals.minutes).toBe(60);
    expect(economia.totals.videoCostUsdCents).toBe(6);
    expect(economia.totals.videoCostEurCents).toBe(6);
    expect(economia.totals.marginCents).toBe(800 - 6);
  });

  it("com 12 meses, volta a apanhar os dois", async () => {
    await cenario();
    const economia = await getPlatformEconomics(TODOS, "12m", AGORA);

    expect(economia.periodLabel).toBe("12 meses");
    expect(economia.rows).toHaveLength(2);
    expect(economia.totals.revenueCents).toBe(11_000);
    expect(economia.totals.commissionCents).toBe(1100);
    expect(economia.totals.minutes).toBe(180);
  });

  /*
   * O teste que prova que o bloco MUDA com o seletor — que era o defeito. Três
   * períodos, três respostas diferentes sobre os mesmos dados. Antes desta
   * frente os três davam exatamente o mesmo número.
   */
  it("o seletor muda os números, e é isso que estava partido", async () => {
    await cenario();
    const [trinta, noventa, ano] = await Promise.all([
      getPlatformEconomics(TODOS, "30d", AGORA),
      getPlatformEconomics(TODOS, "90d", AGORA),
      getPlatformEconomics(TODOS, "12m", AGORA),
    ]);

    // 30 e 90 dias apanham só julho; 12 meses apanha também março.
    expect([
      trinta.totals.revenueCents,
      noventa.totals.revenueCents,
      ano.totals.revenueCents,
    ]).toEqual([8000, 8000, 11_000]);
    expect([trinta.totals.minutes, noventa.totals.minutes, ano.totals.minutes]).toEqual([
      60, 60, 180,
    ]);
    // O controlo: se a janela não estivesse a ser aplicada, os três eram iguais.
    expect(trinta.totals.revenueCents).not.toBe(ano.totals.revenueCents);
  });

  /*
   * As DUAS queries têm de levar a mesma janela. Uma lista de eventos de 30
   * dias com os minutos de sempre dava exatamente o rácio falso que esta frente
   * veio corrigir — e é um erro que não dá erro nenhum, só um número errado.
   */
  it("compradores e minutos vêm da MESMA janela", async () => {
    await cenario();
    const trinta = await getPlatformEconomics(TODOS, "30d", AGORA);

    // Se os minutos viessem de sempre, seriam 180 com uma receita de 8000 —
    // e o custo de vídeo apareceria como 17 em vez de 6.
    expect(trinta.totals.minutes).toBe(60);
    expect(trinta.totals.videoCostEurCents).toBe(6);
    expect(trinta.totals.videoCostEurCents).not.toBe(17);
  });

  it("o âmbito continua a valer dentro da janela", async () => {
    await cenario();
    const outro = await criarCanal();
    const eventoOutro = await criarEvento(outro.id, { priceCents: 5000, startsAt: DENTRO });
    const pessoa = await criarUtilizador();
    await criarEntitlement(pessoa.id, eventoOutro.id, { status: "active", createdAt: DENTRO });

    const soOutro = await getPlatformEconomics(
      { all: false, channelIds: [outro.id] },
      "30d",
      AGORA,
    );
    const nenhum = await getPlatformEconomics({ all: false, channelIds: [] }, "30d", AGORA);

    expect(soOutro.totals.revenueCents).toBe(5000);
    expect(soOutro.rows).toHaveLength(1);
    // Sem canais é zero linhas, nunca a plataforma toda.
    expect(nenhum.rows).toEqual([]);
    expect(nenhum.totals.revenueCents).toBe(0);
  });
});

/*
 * ============================================================================
 *  A AGENDA — a query que não pode trazer dinheiro
 * ============================================================================
 *
 * A página serve-se a quem só opera. O que ela NÃO for buscar é o que não pode
 * escorrer para o payload do RSC — e é por isso que a garantia se testa na
 * QUERY, e não no ecrã: uma coluna escondida no JSX viaja na mesma.
 */
describe.skipIf(!temBaseDeDados())("a agenda não traz dinheiro", () => {
  beforeEach(limparBase);

  /** Tudo o que, aparecendo nesta resposta, seria uma fuga. */
  const CAMPOS_PROIBIDOS = [
    "priceCents",
    "ticketPriceCents",
    "ticketCapacity",
    "buyers",
    "revenueCents",
    "cfLiveInputId",
  ];

  it("as linhas têm exatamente os campos de operação, e nenhum de dinheiro", async () => {
    const canal = await criarCanal();
    await criarEvento(canal.id, {
      title: "Batalha com bilhetes",
      priceCents: 2500,
      ticketPriceCents: 1500,
      ticketCapacity: 200,
      startsAt: DENTRO,
    });

    const [linha] = await listEventsForOperations(TODOS);

    expect(Object.keys(linha).sort()).toEqual(
      ["channelId", "hasTickets", "id", "startsAt", "status", "title"].sort(),
    );
    for (const campo of CAMPOS_PROIBIDOS) {
      expect(linha).not.toHaveProperty(campo);
    }
  });

  /*
   * CONTROLO POSITIVO. Sem isto, o teste acima passava com uma query partida
   * que não devolvesse nada — um zero sozinho não prova nada. Aqui prova-se que
   * os campos proibidos EXISTEM mesmo na fonte, e que é a escolha de colunas
   * que os deixa de fora.
   */
  it("controlo: os mesmos campos existem na lista de gestão", async () => {
    const canal = await criarCanal();
    await criarEvento(canal.id, {
      priceCents: 2500,
      ticketPriceCents: 1500,
      ticketCapacity: 200,
      startsAt: DENTRO,
    });

    const { listEventsWithSales } = await import("@/server/stats");
    const [gestao] = await listEventsWithSales(TODOS);

    // A lista de gestão traz-os todos — logo o vazio acima não é um acidente
    // de a fábrica não os ter preenchido.
    expect(gestao.priceCents).toBe(2500);
    expect(gestao.ticketPriceCents).toBe(1500);
    expect(gestao).toHaveProperty("revenueCents");
    expect(gestao).toHaveProperty("buyers");
  });

  it("`hasTickets` é o único sinal de bilhetes — e nunca o preço deles", async () => {
    const canal = await criarCanal();
    const comBilhetes = await criarEvento(canal.id, {
      title: "Com bilhetes",
      ticketPriceCents: 1500,
      startsAt: DENTRO,
    });
    const semBilhetes = await criarEvento(canal.id, {
      title: "Sem bilhetes",
      ticketPriceCents: null,
      startsAt: DENTRO,
    });

    const porId = new Map(
      (await listEventsForOperations(TODOS)).map((e: EventForOperations) => [e.id, e]),
    );

    expect(porId.get(comBilhetes.id)?.hasTickets).toBe(true);
    expect(porId.get(semBilhetes.id)?.hasTickets).toBe(false);
    // O valor é um booleano de verdade, e não os 1500 a fazer-se passar por um.
    expect(typeof porId.get(comBilhetes.id)?.hasTickets).toBe("boolean");
  });

  it("respeita o âmbito: a equipa de uma liga não vê a agenda da outra", async () => {
    const canalA = await criarCanal();
    const canalB = await criarCanal();
    const daA = await criarEvento(canalA.id, { title: "Da liga A", startsAt: DENTRO });
    await criarEvento(canalB.id, { title: "Da liga B", startsAt: DENTRO });

    const soA = await listEventsForOperations({ all: false, channelIds: [canalA.id] });
    const nenhum = await listEventsForOperations({ all: false, channelIds: [] });

    expect(soA.map((e) => e.id)).toEqual([daA.id]);
    // Sem canais é zero linhas, nunca a plataforma toda.
    expect(nenhum).toEqual([]);
  });
});
