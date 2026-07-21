import { beforeEach, describe, expect, it } from "vitest";
import type { ChannelScope } from "@/server/authz";
import {
  bucketKeysBetween,
  getDashboardTrends,
  getEventConcurrency,
  getMonthlyStatement,
  getPlatformHealth,
  getRevenueByPeriod,
  getSignupsByPeriod,
  listEventsWithConcurrency,
  listSalesByEvent,
  resolvePeriod,
} from "@/server/stats";
import { limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import {
  criarBilhete,
  criarCanal,
  criarEntitlement,
  criarEvento,
  criarSessao,
  criarUtilizador,
} from "../apoio/fabrica";

/*
 * ============================================================================
 *  A DASHBOARD GLOBAL — os números têm de bater, ao cêntimo
 * ============================================================================
 *
 * Estes testes existem por causa de uma lição repetida seis vezes neste
 * projeto: um comentário afirmar que as contas batem e a medição desmenti-lo.
 * Por isso NENHUM valor esperado aqui é lido do código — todos são calculados à
 * mão no cenário, e escritos como literais.
 *
 * O cenário (comissão de 10 %, a de referência):
 *
 *   Canal A · evento A1 a 8,50 €        Canal B · evento B1 a 10,00 €
 *     3 acessos na semana de 6 jul        1 acesso na semana de 13 jul
 *     2 acessos na semana de 13 jul
 *     2 bilhetes a 15,00 €, 13 jul
 *
 *   PPV canal A   5 × 850  = 4250    comissão 5 × round(85)  = 425
 *   PPV canal B   1 × 1000 = 1000    comissão 1 × round(100) = 100
 *   PPV total               = 5250   comissão total          = 525
 *   Bilhetes A    2 × 1500  = 3000   comissão 2 × round(150) = 300
 *
 * O ruído que NÃO pode entrar em conta nenhuma: um acesso `pending`, um
 * `refunded` e um bilhete `pending`.
 */

const AGORA = new Date("2026-07-20T12:00:00Z");
const TODOS: ChannelScope = { all: true };

/** Preços do cenário, em cêntimos. Escritos uma vez, usados nas contas à mão. */
const PPV_A = 850;
const PPV_B = 1000;
const BILHETE_A = 1500;

/**
 * 2026-07-12T23:30:00Z é **domingo** em UTC e **segunda, 00:30** em Lisboa
 * (julho é UTC+1). É o caso que distingue um `date_trunc` feito na hora certa
 * de um feito em UTC: agrupado em UTC esta compra caía na semana de 6 de julho,
 * quando para quem a fez — e para quem lê o gráfico — foi na de 13.
 */
const MEIA_NOITE_DE_LISBOA = new Date("2026-07-12T23:30:00Z");

async function cenario() {
  const canalA = await criarCanal({ name: "Liga A" });
  const canalB = await criarCanal({ name: "Liga B" });
  const eventoA = await criarEvento(canalA.id, { priceCents: PPV_A, startsAt: AGORA });
  const eventoB = await criarEvento(canalB.id, { priceCents: PPV_B, startsAt: AGORA });

  const compras: { evento: string; quando: Date; status: string }[] = [
    { evento: eventoA.id, quando: new Date("2026-07-08T10:00:00Z"), status: "active" },
    { evento: eventoA.id, quando: new Date("2026-07-08T11:00:00Z"), status: "active" },
    { evento: eventoA.id, quando: new Date("2026-07-08T12:00:00Z"), status: "active" },
    { evento: eventoA.id, quando: new Date("2026-07-15T10:00:00Z"), status: "active" },
    { evento: eventoA.id, quando: MEIA_NOITE_DE_LISBOA, status: "active" },
    { evento: eventoB.id, quando: new Date("2026-07-15T10:00:00Z"), status: "active" },
    // Ruído: nem um `pending` nem um `refunded` são dinheiro entrado.
    { evento: eventoA.id, quando: new Date("2026-07-15T10:00:00Z"), status: "pending" },
    { evento: eventoA.id, quando: new Date("2026-07-15T10:00:00Z"), status: "refunded" },
  ];

  for (const compra of compras) {
    const pessoa = await criarUtilizador();
    await criarEntitlement(pessoa.id, compra.evento, {
      status: compra.status,
      createdAt: compra.quando,
    });
  }

  for (const status of ["issued", "used", "pending"]) {
    const pessoa = await criarUtilizador();
    await criarBilhete(pessoa.id, eventoA.id, {
      status,
      priceCents: BILHETE_A,
      createdAt: new Date("2026-07-15T10:00:00Z"),
    });
  }

  return { canalA, canalB, eventoA, eventoB };
}

describe.skipIf(!temBaseDeDados())("dashboard da plataforma", () => {
  beforeEach(limparBase);

  describe("baldes de calendário", () => {
    it("a semana começa à segunda e não deixa furos", () => {
      const chaves = bucketKeysBetween(
        new Date("2026-07-08T10:00:00Z"),
        new Date("2026-07-20T12:00:00Z"),
        "week",
      );
      // 8 de julho é quarta: o balde dela é a segunda anterior, 6 de julho.
      expect(chaves).toEqual(["2026-07-06", "2026-07-13", "2026-07-20"]);
    });

    it("o mês começa no dia 1", () => {
      const chaves = bucketKeysBetween(
        new Date("2026-05-17T10:00:00Z"),
        new Date("2026-07-20T12:00:00Z"),
        "month",
      );
      expect(chaves).toEqual(["2026-05-01", "2026-06-01", "2026-07-01"]);
    });

    it("um período pedido no URL que não existe cai no de referência", () => {
      expect(resolvePeriod("90d")).toBe("90d");
      expect(resolvePeriod("12m")).toBe("12m");
      expect(resolvePeriod("../../etc/passwd")).toBe("90d");
      expect(resolvePeriod(undefined)).toBe("90d");
    });
  });

  describe("receita por período", () => {
    it("agrupa por semana e por canal, com os totais à mão", async () => {
      const { canalA, canalB } = await cenario();
      const serie = await getRevenueByPeriod(TODOS, "90d", AGORA);

      const linha = (bucket: string, canal: string) =>
        serie.rows.find((r) => r.bucket === bucket && r.channelId === canal);

      // Semana de 6 jul, canal A: 3 × 8,50 € = 25,50 €; comissão 3 × 0,85 €.
      expect(linha("2026-07-06", canalA.id)).toMatchObject({
        ppvCents: 3 * PPV_A,
        ppvPurchases: 3,
        ppvCommissionCents: 3 * 85,
        ticketCents: 0,
        ticketsSold: 0,
      });

      // Semana de 13 jul, canal A: 2 acessos + 2 bilhetes a 15,00 €.
      expect(linha("2026-07-13", canalA.id)).toMatchObject({
        ppvCents: 2 * PPV_A,
        ppvPurchases: 2,
        ppvCommissionCents: 2 * 85,
        ticketCents: 2 * BILHETE_A,
        ticketsSold: 2,
        ticketCommissionCents: 2 * 150,
      });

      // Semana de 13 jul, canal B: 1 acesso a 10,00 €.
      expect(linha("2026-07-13", canalB.id)).toMatchObject({
        ppvCents: PPV_B,
        ppvPurchases: 1,
        ppvCommissionCents: 100,
      });

      expect(serie.totals).toEqual({
        ppvCents: 5250,
        ppvPurchases: 6,
        ppvCommissionCents: 525,
        ticketCents: 3000,
        ticketsSold: 2,
        ticketCommissionCents: 300,
      });
    });

    it("agrupa a meia-noite de Lisboa na semana de Lisboa, não na de UTC", async () => {
      const { canalA } = await cenario();
      const serie = await getRevenueByPeriod(TODOS, "90d", AGORA);

      // A compra das 00:30 de Lisboa de segunda 13 é a 5ª do canal A: se o
      // agrupamento fosse em UTC, ela estaria na semana de 6 e os dois baldes
      // dariam 4 e 1 em vez de 3 e 2.
      const seis = serie.rows.find((r) => r.bucket === "2026-07-06" && r.channelId === canalA.id);
      const treze = serie.rows.find((r) => r.bucket === "2026-07-13" && r.channelId === canalA.id);
      expect([seis?.ppvPurchases, treze?.ppvPurchases]).toEqual([3, 2]);
    });

    it("os baldes cobrem o período todo, mesmo os que não venderam nada", async () => {
      await cenario();
      const serie = await getRevenueByPeriod(TODOS, "90d", AGORA);

      expect(serie.buckets.at(-1)).toBe("2026-07-20");
      expect(serie.buckets).toContain("2026-07-06");
      expect(serie.buckets).toContain("2026-07-13");
      // 90 dias em semanas: 13 baldes cheios mais o da semana corrente.
      expect(serie.buckets.length).toBe(14);
      // Sem furos: cada balde está a 7 dias do anterior.
      for (let i = 1; i < serie.buckets.length; i += 1) {
        const anterior = Date.parse(`${serie.buckets[i - 1]}T00:00:00Z`);
        const atual = Date.parse(`${serie.buckets[i]}T00:00:00Z`);
        expect(atual - anterior).toBe(7 * 86_400_000);
      }
    });

    it("deixa de fora o que aconteceu antes do período", async () => {
      const { eventoA } = await cenario();
      const antiga = await criarUtilizador();
      await criarEntitlement(antiga.id, eventoA.id, {
        status: "active",
        createdAt: new Date("2025-12-01T10:00:00Z"),
      });

      const noventa = await getRevenueByPeriod(TODOS, "90d", AGORA);
      const ano = await getRevenueByPeriod(TODOS, "12m", AGORA);

      expect(noventa.totals.ppvCents).toBe(5250);
      // Em 12 meses a compra de dezembro já conta — e só ela muda o total.
      expect(ano.totals.ppvCents).toBe(5250 + PPV_A);
    });

    it("agrupa por mês quando o período é de 12 meses", async () => {
      await cenario();
      const serie = await getRevenueByPeriod(TODOS, "12m", AGORA);

      expect(serie.unit).toBe("month");
      expect(serie.rows.every((r) => r.bucket === "2026-07-01")).toBe(true);
      expect(serie.totals.ppvCents).toBe(5250);
    });
  });

  describe("âmbito", () => {
    it("o dono de um canal não vê um cêntimo do outro", async () => {
      const { canalA } = await cenario();
      const soA: ChannelScope = { all: false, channelIds: [canalA.id] };

      const serie = await getRevenueByPeriod(soA, "90d", AGORA);

      expect(serie.channelIds).toEqual([canalA.id]);
      expect(serie.totals.ppvCents).toBe(5 * PPV_A);
      expect(serie.totals.ppvCommissionCents).toBe(5 * 85);
      expect(serie.rows.every((r) => r.channelId === canalA.id)).toBe(true);
    });

    it("quem não gere canal nenhum recebe zero linhas, nunca a plataforma toda", async () => {
      await cenario();
      const nenhum: ChannelScope = { all: false, channelIds: [] };

      const serie = await getRevenueByPeriod(nenhum, "90d", AGORA);
      const vendas = await listSalesByEvent(nenhum, "90d", AGORA);
      const saude = await getPlatformHealth(nenhum, "90d", AGORA);

      expect(serie.rows).toEqual([]);
      expect(serie.totals.ppvCents).toBe(0);
      expect(vendas.rows).toEqual([]);
      expect(saude.blockedTotal).toBe(0);
    });

    it("o âmbito global vê os dois canais", async () => {
      const { canalA, canalB } = await cenario();
      const serie = await getRevenueByPeriod(TODOS, "90d", AGORA);
      expect([...serie.channelIds].sort()).toEqual([canalA.id, canalB.id].sort());
    });
  });

  /*
   * ============================================================================
   *  RECONCILIAÇÃO COM O EXTRATO — a identidade ESTENDEU-SE, não se apagou
   * ============================================================================
   *
   * Dois ecrãs sobre o mesmo dinheiro não podem dizer números diferentes.
   *
   * O extrato contava só PPV, e a identidade era `ppvCents ≡ grossCents`. Com os
   * bilhetes lá dentro, cada lado passou a ter as suas duas parcelas e a
   * igualdade é sobre ambas — parcela A PARCELA, e não só no total.
   *
   * Isso é de propósito: dois erros simétricos (PPV a mais e bilhetes a menos)
   * davam um total certo com dois números errados, e um teste só sobre o total
   * deixava-os passar sem uma linha vermelha.
   *
   * Contas à mão do cenário, todas em cêntimos:
   *
   *   PPV       5 × 850 + 1 × 1000       = 5250   comissão 5×85 + 1×100 = 525
   *   Bilhetes  2 × 1500                 = 3000   comissão 2×150        = 300
   *   Bruto                              = 8250   comissão              = 825
   */
  describe("reconciliação com o extrato de ganhos", () => {
    it("as duas parcelas da dashboard são, ao cêntimo, as duas do extrato", async () => {
      await cenario();

      const serie = await getRevenueByPeriod(TODOS, "12m", AGORA);
      const extrato = await getMonthlyStatement(TODOS);
      const soma = (campo: keyof (typeof extrato.rows)[number]) =>
        extrato.rows.reduce((n, r) => n + (r[campo] as number), 0);

      // Parcela a parcela — é isto que um total sozinho não prova.
      expect(serie.totals.ppvCents).toBe(soma("ppvGrossCents"));
      expect(serie.totals.ticketCents).toBe(soma("ticketGrossCents"));
      expect(serie.totals.ppvPurchases).toBe(soma("ppvPurchases"));
      expect(serie.totals.ticketsSold).toBe(soma("ticketsSold"));

      // E depois a soma, que é o que a liga recebe.
      expect(serie.totals.ppvCents + serie.totals.ticketCents).toBe(soma("grossCents"));
      expect(serie.totals.ppvCommissionCents + serie.totals.ticketCommissionCents).toBe(
        soma("firstrowFeeCents"),
      );
      expect(serie.totals.ppvPurchases + serie.totals.ticketsSold).toBe(soma("purchases"));

      // Os valores calculados à mão, para o caso de ambos os lados estarem
      // errados da mesma maneira — que é o que uma identidade sozinha não apanha.
      expect(soma("ppvGrossCents")).toBe(5250);
      expect(soma("ticketGrossCents")).toBe(3000);
      expect(soma("grossCents")).toBe(8250);
      expect(soma("firstrowFeeCents")).toBe(825);
      expect(soma("purchases")).toBe(8);
    });

    /*
     * O ruído do cenário, verificado do lado do extrato: um acesso `pending`,
     * um `refunded` e um bilhete `pending` não são dinheiro entrado. Se algum
     * deles passasse a contar, os números acima subiam e este teste diria qual.
     */
    it("nem um acesso pendente, nem um reembolsado, nem um bilhete por pagar entram", async () => {
      await cenario();
      const extrato = await getMonthlyStatement(TODOS);

      const bruto = extrato.rows.reduce((n, r) => n + r.grossCents, 0);
      const bilhetes = extrato.rows.reduce((n, r) => n + r.ticketsSold, 0);
      const acessos = extrato.rows.reduce((n, r) => n + r.ppvPurchases, 0);

      // 8 acessos criados, 6 activos. 3 bilhetes criados, 2 pagos.
      expect(acessos).toBe(6);
      expect(bilhetes).toBe(2);
      // Com o pendente e o reembolsado a contar seriam 8250 + 2×850 = 9950;
      // com o bilhete pendente, mais 1500.
      expect(bruto).toBe(8250);
    });

    it("o líquido é o bruto menos as duas taxas, ao cêntimo", async () => {
      await cenario();
      const extrato = await getMonthlyStatement(TODOS);
      const soma = (campo: keyof (typeof extrato.rows)[number]) =>
        extrato.rows.reduce((n, r) => n + (r[campo] as number), 0);

      /*
       * Eupago à mão: 0,07 € + 0,7 % por transação, arredondado por transação.
       *   PPV 8,50 €  → 7 + round(5,95)  = 13, cinco vezes = 65
       *   PPV 10,00 € → 7 + round(7,00)  = 14, uma vez     = 14
       *   Bilhete 15,00 € → 7 + round(10,5) = 18, duas vezes = 36
       */
      expect(soma("eupagoFeeCents")).toBe(5 * 13 + 14 + 2 * 18);
      expect(soma("netCents")).toBe(8250 - 825 - 115);
    });

    it("bate por canal, e não só no total", async () => {
      const { canalA } = await cenario();
      const soA: ChannelScope = { all: false, channelIds: [canalA.id] };

      const serie = await getRevenueByPeriod(soA, "12m", AGORA);
      const extrato = await getMonthlyStatement(soA);
      const soma = (campo: keyof (typeof extrato.rows)[number]) =>
        extrato.rows.reduce((n, r) => n + (r[campo] as number), 0);

      expect(serie.totals.ppvCents).toBe(soma("ppvGrossCents"));
      expect(serie.totals.ticketCents).toBe(soma("ticketGrossCents"));
      expect(serie.totals.ppvCents + serie.totals.ticketCents).toBe(soma("grossCents"));
      expect(serie.totals.ppvCommissionCents + serie.totals.ticketCommissionCents).toBe(
        soma("firstrowFeeCents"),
      );
      // O canal A é o único com bilhetes — os 3000 são todos dele.
      expect(soma("ticketGrossCents")).toBe(3000);
      expect(soma("grossCents")).toBe(5 * PPV_A + 3000);
    });

    it("o dono de um canal não vê um bilhete do outro", async () => {
      const { canalB } = await cenario();
      const soB: ChannelScope = { all: false, channelIds: [canalB.id] };

      const extrato = await getMonthlyStatement(soB);

      // Os bilhetes são todos do canal A. O extrato do B não pode ter nenhum.
      expect(extrato.rows.reduce((n, r) => n + r.ticketGrossCents, 0)).toBe(0);
      expect(extrato.rows.reduce((n, r) => n + r.ticketsSold, 0)).toBe(0);
      expect(extrato.rows.reduce((n, r) => n + r.grossCents, 0)).toBe(PPV_B);
      expect(extrato.rows.every((r) => r.channelId === canalB.id)).toBe(true);
    });

    it("a comissão arredonda por transação, como o extrato e o split", async () => {
      const canal = await criarCanal();
      // 8,55 €: 10 % dá 0,855 — o preço em que arredondar por compra e
      // arredondar no fim divergem. 131 compras: 112,01 € contra 112,66 €.
      const evento = await criarEvento(canal.id, { priceCents: 855, startsAt: AGORA });
      for (let i = 0; i < 131; i += 1) {
        const pessoa = await criarUtilizador();
        await criarEntitlement(pessoa.id, evento.id, {
          status: "active",
          createdAt: new Date("2026-07-15T10:00:00Z"),
        });
      }

      /*
       * E 7 bilhetes ao MESMO preço de meio cêntimo. Os bilhetes passam pela
       * mesma expressão de comissão (`firstrowFeeOf`), e é aqui que se prova:
       * se algum dia alguém lhes puser um `round(sum(...))`, a soma dos dois
       * lados deixa de bater e esta linha fica vermelha.
       */
      for (let i = 0; i < 7; i += 1) {
        const pessoa = await criarUtilizador();
        await criarBilhete(pessoa.id, evento.id, {
          status: "issued",
          priceCents: 855,
          createdAt: new Date("2026-07-15T10:00:00Z"),
        });
      }

      const serie = await getRevenueByPeriod(TODOS, "12m", AGORA);
      const extrato = await getMonthlyStatement(TODOS);
      const soma = (campo: keyof (typeof extrato.rows)[number]) =>
        extrato.rows.reduce((n, r) => n + (r[campo] as number), 0);

      // round(85,5) = 86 cêntimos por transação × 131 acessos = 11 266.
      expect(serie.totals.ppvCommissionCents).toBe(131 * 86);
      // E × 7 bilhetes = 602. Cada origem arredonda a sua, e só depois somam.
      expect(serie.totals.ticketCommissionCents).toBe(7 * 86);
      expect(serie.totals.ppvCommissionCents + serie.totals.ticketCommissionCents).toBe(
        soma("firstrowFeeCents"),
      );
      expect(soma("firstrowFeeCents")).toBe(138 * 86);
      // As contas que NÃO se fazem, para o teste falhar se alguém as trocar.
      expect(serie.totals.ppvCommissionCents).not.toBe(Math.round((131 * 855 * 10) / 100));
      expect(soma("firstrowFeeCents")).not.toBe(Math.round((138 * 855 * 10) / 100));
    });
  });

  describe("vendas por evento", () => {
    it("separa PPV de bilhetes e soma a comissão dos dois", async () => {
      const { eventoA, eventoB } = await cenario();
      const { rows } = await listSalesByEvent(TODOS, "90d", AGORA);

      const a = rows.find((r) => r.eventId === eventoA.id);
      const b = rows.find((r) => r.eventId === eventoB.id);

      expect(a).toMatchObject({
        ppvBuyers: 5,
        ppvCents: 5 * PPV_A,
        ticketsSold: 2,
        ticketCents: 2 * BILHETE_A,
        // 5 × 0,85 € + 2 × 1,50 € = 4,25 € + 3,00 € = 7,25 €
        commissionCents: 5 * 85 + 2 * 150,
      });
      expect(b).toMatchObject({ ppvBuyers: 1, ppvCents: PPV_B, ticketsSold: 0, ticketCents: 0 });
    });

    it("não multiplica acessos por bilhetes (a armadilha da cardinalidade)", async () => {
      const { eventoA } = await cenario();
      const { rows } = await listSalesByEvent(TODOS, "90d", AGORA);
      const a = rows.find((r) => r.eventId === eventoA.id);

      // Numa query agrupada só, 5 acessos × 2 bilhetes davam 10 de cada.
      expect(a?.ppvBuyers).toBe(5);
      expect(a?.ticketsSold).toBe(2);
    });

    it("deixa de fora os eventos que não venderam nada", async () => {
      const { canalA } = await cenario();
      const rascunho = await criarEvento(canalA.id, { title: "Nunca vendeu" });
      const { rows } = await listSalesByEvent(TODOS, "90d", AGORA);
      expect(rows.some((r) => r.eventId === rascunho.id)).toBe(false);
    });
  });

  describe("espectadores em simultâneo", () => {
    /*
     * Três sessões desenhadas para terem um pico conhecido:
     *
     *   A  ├────────────┤            21:00 → 21:30
     *   B      ├────────────┤        21:10 → 21:40
     *   C           ├───┤            21:20 → 21:25
     *
     * Às 21:20 estão as três vivas ao mesmo tempo → pico 3.
     * Depois das 21:30 sobra a B → 1.
     */
    async function tresSessoes() {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id, { startsAt: new Date("2026-07-15T20:00:00Z") });
      const janela = [
        ["2026-07-15T21:00:00Z", "2026-07-15T21:30:00Z"],
        ["2026-07-15T21:10:00Z", "2026-07-15T21:40:00Z"],
        ["2026-07-15T21:20:00Z", "2026-07-15T21:25:00Z"],
      ];
      for (const [inicio, fim] of janela) {
        const pessoa = await criarUtilizador();
        await criarSessao(pessoa.id, evento.id, {
          startedAt: new Date(inicio),
          lastHeartbeatAt: new Date(fim),
        });
      }
      return { canal, evento };
    }

    it("o pico é o que se conta à mão", async () => {
      const { evento } = await tresSessoes();
      const curva = await getEventConcurrency(evento.id);

      expect(curva.sessions).toBe(3);
      expect(curva.peak).toBe(3);
      expect(curva.points.length).toBeGreaterThan(0);
      // O pico é sempre o máximo da curva desenhada — nunca um número à parte
      // que a linha por baixo desminta.
      expect(curva.peak).toBe(Math.max(...curva.points.map((p) => p.viewers)));
    });

    it("a curva começa e acaba na janela real das sessões", async () => {
      const { evento } = await tresSessoes();
      const curva = await getEventConcurrency(evento.id);

      expect(curva.points[0]?.at.toISOString()).toBe("2026-07-15T21:00:00.000Z");
      expect(curva.points.at(-1)?.at.getTime()).toBeLessThanOrEqual(
        Date.parse("2026-07-15T21:40:00Z"),
      );
      // Ao minuto 0 só a primeira sessão tinha começado.
      expect(curva.points[0]?.viewers).toBe(1);
    });

    it("uma sessão cortada deixa de contar a partir do corte", async () => {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id);
      const pessoa = await criarUtilizador();
      await criarSessao(pessoa.id, evento.id, {
        startedAt: new Date("2026-07-15T21:00:00Z"),
        lastHeartbeatAt: new Date("2026-07-15T21:30:00Z"),
        revokedAt: new Date("2026-07-15T21:10:00Z"),
        revokedReason: "other_device",
      });

      const curva = await getEventConcurrency(evento.id);
      // A janela fecha no corte, não no último heartbeat.
      expect(curva.points.at(-1)?.at.getTime()).toBeLessThanOrEqual(
        Date.parse("2026-07-15T21:10:00Z"),
      );
    });

    it("um evento sem sessões devolve curva vazia, e não uma linha a zeros", async () => {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id);
      const curva = await getEventConcurrency(evento.id);

      expect(curva.points).toEqual([]);
      expect(curva.peak).toBe(0);
      expect(curva.sessions).toBe(0);
    });

    it("só lista eventos que têm sessões, e dentro do âmbito", async () => {
      const { canal, evento } = await tresSessoes();
      const outro = await criarCanal();
      const eventoOutro = await criarEvento(outro.id);
      const pessoa = await criarUtilizador();
      await criarSessao(pessoa.id, eventoOutro.id, {
        startedAt: new Date("2026-07-15T21:00:00Z"),
        lastHeartbeatAt: new Date("2026-07-15T21:05:00Z"),
      });

      const todos = await listEventsWithConcurrency(TODOS);
      const soUm = await listEventsWithConcurrency({ all: false, channelIds: [canal.id] });

      expect(todos.map((e) => e.eventId).sort()).toEqual([evento.id, eventoOutro.id].sort());
      expect(soUm.map((e) => e.eventId)).toEqual([evento.id]);
      expect(soUm[0]?.sessions).toBe(3);
    });
  });

  describe("registos e conversão por coorte", () => {
    it("conta cada conta no balde em que nasceu, e só as que compraram como convertidas", async () => {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id, { priceCents: PPV_A });

      // Semana de 6 jul: 3 registos, 1 comprou.
      for (let i = 0; i < 3; i += 1) {
        const pessoa = await criarUtilizador({ createdAt: new Date("2026-07-08T10:00:00Z") });
        if (i === 0) {
          await criarEntitlement(pessoa.id, evento.id, {
            status: "active",
            // A compra é DEPOIS, e noutra semana: a coorte é a do registo.
            createdAt: new Date("2026-07-16T10:00:00Z"),
          });
        }
      }
      // Semana de 13 jul: 2 registos, 1 comprou (com bilhete, não com PPV).
      for (let i = 0; i < 2; i += 1) {
        const pessoa = await criarUtilizador({ createdAt: new Date("2026-07-15T10:00:00Z") });
        if (i === 0) {
          await criarBilhete(pessoa.id, evento.id, { status: "issued", priceCents: BILHETE_A });
        }
      }

      const serie = await getSignupsByPeriod("90d", AGORA);
      const semana = (b: string) => serie.rows.find((r) => r.bucket === b);

      expect(semana("2026-07-06")).toMatchObject({ signups: 3, converted: 1 });
      expect(semana("2026-07-13")).toMatchObject({ signups: 2, converted: 1 });
      expect(serie.totals).toEqual({ signups: 5, converted: 2 });
    });

    it("um acesso pendente não é uma conversão", async () => {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id);
      const pessoa = await criarUtilizador({ createdAt: new Date("2026-07-08T10:00:00Z") });
      await criarEntitlement(pessoa.id, evento.id, { status: "pending" });

      const serie = await getSignupsByPeriod("90d", AGORA);
      expect(serie.totals).toEqual({ signups: 1, converted: 0 });
    });

    it("um bilhete pendente também não", async () => {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id);
      const pessoa = await criarUtilizador({ createdAt: new Date("2026-07-08T10:00:00Z") });
      await criarBilhete(pessoa.id, evento.id, { status: "pending" });

      const serie = await getSignupsByPeriod("90d", AGORA);
      expect(serie.totals).toEqual({ signups: 1, converted: 0 });
    });
  });

  /*
   * A métrica que a Frente N limpou. O teste existe para ela não voltar a
   * sujar-se: uma reconexão do mesmo dispositivo é `superseded_at` e NÃO é um
   * bloqueio. Se alguém voltar a somar as duas, este teste cai.
   */
  describe("saúde: sessões bloqueadas", () => {
    it("conta revoked por motivo e nunca conta superseded", async () => {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id);
      const pessoa = await criarUtilizador();
      const quando = new Date("2026-07-15T21:00:00Z");

      await criarSessao(pessoa.id, evento.id, {
        revokedAt: quando,
        revokedReason: "other_device",
      });
      await criarSessao(pessoa.id, evento.id, {
        revokedAt: quando,
        revokedReason: "other_device",
      });
      await criarSessao(pessoa.id, evento.id, { revokedAt: quando, revokedReason: "watermark" });
      // Cinco reconexões do MESMO browser: silenciosas, nenhuma é bloqueio.
      for (let i = 0; i < 5; i += 1) {
        await criarSessao(pessoa.id, evento.id, { supersededAt: quando });
      }

      const saude = await getPlatformHealth(TODOS, "90d", AGORA);
      const porMotivo = new Map(saude.blocked.map((b) => [b.reason, b.total]));

      expect(porMotivo.get("other_device")).toBe(2);
      expect(porMotivo.get("watermark")).toBe(1);
      expect(saude.blockedTotal).toBe(3);
      expect(saude.superseded).toBe(5);
    });

    it("os motivos saem separados — partilha suspeita não se mistura com adulteração", async () => {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id);
      const pessoa = await criarUtilizador();
      await criarSessao(pessoa.id, evento.id, {
        revokedAt: new Date("2026-07-15T21:00:00Z"),
        revokedReason: "no_access",
      });

      const saude = await getPlatformHealth(TODOS, "90d", AGORA);
      expect(saude.blocked).toEqual([{ reason: "no_access", total: 1 }]);
    });
  });

  /*
   * ==========================================================================
   *  TENDÊNCIAS — o período contra o período anterior, ao número
   * ==========================================================================
   *
   * A regra da sessão: nenhuma variação se afirma sem se semear valor conhecido
   * em DOIS períodos e calcular a conta à mão. Aqui está o cenário, com as
   * janelas de 90 dias a contar de 2026-07-20 já resolvidas:
   *
   *   início do período ATUAL    ≈ 2026-04-22 (Lisboa)  → [atual, ∞)
   *   início do período ANTERIOR ≈ 2026-01-22 (Lisboa)  → [anterior, atual)
   *
   * Por isso 2026-07-15 cai no ATUAL, 2026-03-01 no ANTERIOR, e 2025-06-01 fica
   * de fora dos dois — o controlo negativo.
   *
   * O cenário, pessoa a pessoa (todas com `createdAt` no dia da sua atividade,
   * para os REGISTOS serem contáveis):
   *
   *   ATUAL (2026-07-15)
   *     A  regista-se · compra PPV (10 €) · vê             → comprador + espectador
   *     B  regista-se · compra PPV (10 €) · vê             → comprador + espectador
   *     C  regista-se · compra PPV (10 €) · compra bilhete → comprador das DUAS origens
   *     D  regista-se · compra bilhete (20 €)              → comprador só de bilhete
   *   ANTERIOR (2026-03-01)
   *     E  regista-se · compra PPV (10 €)                  → comprador
   *     F  regista-se · vê                                 → espectador
   *   FORA (2025-06-01)
   *     G  regista-se · compra PPV · vê                    → não conta em lado nenhum
   *
   * Contas à mão:
   *                        ATUAL            ANTERIOR       variação
   *   Receita   3×1000 + 2×2000 = 7000      1×1000 = 1000  (7000−1000)/1000 = 6,0
   *   Espectadores  {A,B}       = 2         {F}    = 1      (2−1)/1        = 1,0
   *   Compradores {A,B,C,D}     = 4         {E}    = 1      (4−1)/1        = 3,0
   *   Registos  {A,B,C,D}       = 4         {E,F}  = 2      (4−2)/2        = 1,0
   *
   * O 4 dos compradores (e não 5) é a prova da UNIÃO: o C comprou PPV e bilhete
   * e conta UMA vez, não duas.
   */
  describe("tendências: período contra período anterior", () => {
    const CURRENT = new Date("2026-07-15T10:00:00Z");
    const PRIOR = new Date("2026-03-01T10:00:00Z");
    const FORA = new Date("2025-06-01T10:00:00Z");
    const PPV = 1000;
    const BILHETE = 2000;

    async function cenarioTendencia() {
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id, { priceCents: PPV, startsAt: AGORA });

      const criarEspectador = async (userId: string, quando: Date) => {
        await criarSessao(userId, evento.id, {
          startedAt: new Date(`${quando.toISOString().slice(0, 10)}T21:00:00Z`),
          lastHeartbeatAt: new Date(`${quando.toISOString().slice(0, 10)}T21:30:00Z`),
        });
      };

      // ATUAL
      const a = await criarUtilizador({ createdAt: CURRENT });
      await criarEntitlement(a.id, evento.id, { status: "active", createdAt: CURRENT });
      await criarEspectador(a.id, CURRENT);
      const b = await criarUtilizador({ createdAt: CURRENT });
      await criarEntitlement(b.id, evento.id, { status: "active", createdAt: CURRENT });
      await criarEspectador(b.id, CURRENT);
      const c = await criarUtilizador({ createdAt: CURRENT });
      await criarEntitlement(c.id, evento.id, { status: "active", createdAt: CURRENT });
      await criarBilhete(c.id, evento.id, {
        status: "issued",
        priceCents: BILHETE,
        createdAt: CURRENT,
      });
      const d = await criarUtilizador({ createdAt: CURRENT });
      await criarBilhete(d.id, evento.id, {
        status: "issued",
        priceCents: BILHETE,
        createdAt: CURRENT,
      });

      // ANTERIOR
      const e = await criarUtilizador({ createdAt: PRIOR });
      await criarEntitlement(e.id, evento.id, { status: "active", createdAt: PRIOR });
      const f = await criarUtilizador({ createdAt: PRIOR });
      await criarEspectador(f.id, PRIOR);

      // FORA — o controlo negativo: não pode entrar em nenhuma das janelas.
      const g = await criarUtilizador({ createdAt: FORA });
      await criarEntitlement(g.id, evento.id, { status: "active", createdAt: FORA });
      await criarEspectador(g.id, FORA);

      return { canal, evento };
    }

    it("as quatro variações são as calculadas à mão", async () => {
      await cenarioTendencia();
      const trends = await getDashboardTrends(TODOS, "90d", AGORA);

      expect(trends.revenueCents.current).toBe(7000);
      expect(trends.revenueCents.previous).toBe(1000);
      expect(trends.revenueCents.deltaRatio).toBeCloseTo(6, 10);

      expect(trends.viewers.current).toBe(2);
      expect(trends.viewers.previous).toBe(1);
      expect(trends.viewers.deltaRatio).toBeCloseTo(1, 10);

      // 4 e não 5: o C comprou PPV E bilhete e conta uma só vez.
      expect(trends.buyers.current).toBe(4);
      expect(trends.buyers.previous).toBe(1);
      expect(trends.buyers.deltaRatio).toBeCloseTo(3, 10);

      expect(trends.signups.current).toBe(4);
      expect(trends.signups.previous).toBe(2);
      expect(trends.signups.deltaRatio).toBeCloseTo(1, 10);

      expect(trends.periodLabel).toBe("90 dias");
      expect(trends.previousLabel).toBe("90 dias anteriores");
    });

    it("o valor ATUAL bate, ao cêntimo, com o total da secção de receita", async () => {
      // A prova de que as duas janelas usam a MESMA lógica de datas já corrigida:
      // a receita "atual" da tendência é, exatamente, o que o gráfico de receita
      // soma para o mesmo período — senão haveria dois números para o mesmo
      // dinheiro no mesmo ecrã.
      await cenarioTendencia();
      const [trends, serie] = await Promise.all([
        getDashboardTrends(TODOS, "90d", AGORA),
        getRevenueByPeriod(TODOS, "90d", AGORA),
      ]);
      expect(trends.revenueCents.current).toBe(serie.totals.ppvCents + serie.totals.ticketCents);
    });

    it("sem período anterior, a variação é `null` — «novo», nunca +100 %", async () => {
      // Só atividade no período atual: dividir por zero não é subir, é não ter
      // com quê comparar. O ecrã mostra "novo"; a query devolve `null`.
      const canal = await criarCanal();
      const evento = await criarEvento(canal.id, { priceCents: PPV, startsAt: AGORA });
      const pessoa = await criarUtilizador({ createdAt: CURRENT });
      await criarEntitlement(pessoa.id, evento.id, { status: "active", createdAt: CURRENT });

      const trends = await getDashboardTrends(TODOS, "90d", AGORA);
      expect(trends.revenueCents.previous).toBe(0);
      expect(trends.revenueCents.current).toBe(PPV);
      expect(trends.revenueCents.deltaRatio).toBeNull();
    });

    it("a base vazia dá tudo a zero e sem variação — nunca uma seta inventada", async () => {
      const trends = await getDashboardTrends(TODOS, "90d", AGORA);
      for (const t of [trends.revenueCents, trends.viewers, trends.buyers, trends.signups]) {
        expect(t.current).toBe(0);
        expect(t.previous).toBe(0);
        expect(t.deltaRatio).toBeNull();
      }
    });

    it("o filtro de canal estreita receita e compradores, mas os registos ficam globais", async () => {
      const { canal } = await cenarioTendencia();
      // Um segundo canal, com atividade no período atual, que o filtro do
      // primeiro NÃO pode ver no dinheiro — mas cujos registos CONTAM à mesma,
      // porque uma conta não pertence a canal nenhum.
      const outro = await criarCanal();
      const eventoOutro = await criarEvento(outro.id, { priceCents: 5000, startsAt: AGORA });
      const forasteiro = await criarUtilizador({ createdAt: CURRENT });
      await criarEntitlement(forasteiro.id, eventoOutro.id, {
        status: "active",
        createdAt: CURRENT,
      });

      const soPrimeiro = await getDashboardTrends(
        { all: false, channelIds: [canal.id] },
        "90d",
        AGORA,
      );

      // Receita e compradores do primeiro canal, sem um cêntimo nem uma pessoa
      // do outro.
      expect(soPrimeiro.revenueCents.current).toBe(7000);
      expect(soPrimeiro.buyers.current).toBe(4);
      // Registos: A,B,C,D + E,F (do cenário) + o forasteiro, todos criados nas
      // janelas — a plataforma inteira. 5 no atual (A,B,C,D,forasteiro), 2 no
      // anterior (E,F).
      expect(soPrimeiro.signups.current).toBe(5);
      expect(soPrimeiro.signups.previous).toBe(2);
    });
  });
});
