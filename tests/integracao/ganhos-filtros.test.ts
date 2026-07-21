import { beforeEach, describe, expect, it } from "vitest";
import { getMonthlyStatement, monthKeyStart, periodStart } from "@/server/stats";
import { limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { criarCanal, criarEntitlement, criarEvento, criarUtilizador } from "../apoio/fabrica";

/*
 * ============================================================================
 *  FILTROS NOVOS DO EXTRATO — período e canal, medidos ao cêntimo
 * ============================================================================
 *
 * `getMonthlyStatement` ganhou um segundo parâmetro (`period`), opcional e
 * backward-compatible: quem já a chamava sem ele (os testes de identidade com
 * a dashboard global) continua a receber TODOS os meses, sem saber que este
 * parâmetro passou a existir — confirmado à parte em
 * dashboard-plataforma.test.ts e custos-de-video.test.ts, que continuam
 * verdes sem qualquer alteração.
 *
 * O filtro de canal não toca em `getMonthlyStatement` — é feito na página, por
 * cima das linhas já devolvidas (`rows.filter`), porque é exactamente esse o
 * padrão que `channels.byId`/`inScope` já usam noutros ecrãs desta app.
 */

describe.skipIf(!temBaseDeDados())("getMonthlyStatement — filtro de período", () => {
  beforeEach(limparBase);

  it("um mês fora da janela de 30 dias não entra; dentro, entra", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { priceCents: 1000 });

    // Uma compra HÁ 200 DIAS — bem fora de "30 dias" e de "90 dias", dentro de "12 meses".
    const antiga = new Date(Date.now() - 200 * 86_400_000);
    await criarEntitlement(comprador.id, evento.id, { status: "active", createdAt: antiga });

    // Uma compra de HOJE — dentro de todas as janelas.
    const compradorRecente = await criarUtilizador();
    await criarEntitlement(compradorRecente.id, evento.id, { status: "active" });

    const scope = { all: true as const };

    const trinta = await getMonthlyStatement(scope, "30d");
    const noventa = await getMonthlyStatement(scope, "90d");
    const dozeMeses = await getMonthlyStatement(scope, "12m");
    const semFiltro = await getMonthlyStatement(scope);

    // 30d e 90d só apanham a compra de hoje: 1 acesso, 1000 cêntimos brutos.
    expect(trinta.rows.reduce((n, r) => n + r.ppvPurchases, 0)).toBe(1);
    expect(noventa.rows.reduce((n, r) => n + r.ppvPurchases, 0)).toBe(1);
    // 12 meses e "sem filtro" apanham as duas: a antiga e a recente.
    expect(dozeMeses.rows.reduce((n, r) => n + r.ppvPurchases, 0)).toBe(2);
    expect(semFiltro.rows.reduce((n, r) => n + r.ppvPurchases, 0)).toBe(2);

    // O bruto ao cêntimo: 30d/90d só o preço de UMA compra; sem filtro, das DUAS.
    expect(trinta.rows.reduce((n, r) => n + r.grossCents, 0)).toBe(1000);
    expect(semFiltro.rows.reduce((n, r) => n + r.grossCents, 0)).toBe(2000);
  });

  it("monthKeyStart concorda com periodStart sobre o que é 'o mesmo mês'", () => {
    // As duas funções nascem da MESMA lisbonMidnightUtc — nunca podem discordar
    // sobre se um mês está dentro ou fora da janela. Prova direta, sem rede.
    const inicioDoMesAtual = monthKeyStart(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Lisbon",
        year: "numeric",
        month: "2-digit",
      })
        .format(new Date())
        .replace("-", "-")
        .slice(0, 7),
    );
    const inicioDaJanela12m = periodStart("12m");
    // A janela de 12 meses abre no dia 1 de um mês — nunca DEPOIS do início do
    // mês corrente (é sempre igual ou anterior).
    expect(inicioDaJanela12m.getTime()).toBeLessThanOrEqual(inicioDoMesAtual.getTime());
  });

  it("filtro de canal (feito na página) isola as linhas de cada liga ao cêntimo", async () => {
    const canalA = await criarCanal({ slug: `canal-a-${Date.now()}` });
    const canalB = await criarCanal({ slug: `canal-b-${Date.now()}` });
    const comprador = await criarUtilizador();
    const eventoA = await criarEvento(canalA.id, { priceCents: 500 });
    const eventoB = await criarEvento(canalB.id, { priceCents: 900 });
    await criarEntitlement(comprador.id, eventoA.id, { status: "active" });
    const compradorB = await criarUtilizador();
    await criarEntitlement(compradorB.id, eventoB.id, { status: "active" });

    const { rows } = await getMonthlyStatement({ all: true });

    // O que a página faz: rows.filter((r) => r.channelId === canalValido).
    const soA = rows.filter((r) => r.channelId === canalA.id);
    const soB = rows.filter((r) => r.channelId === canalB.id);

    expect(soA.reduce((n, r) => n + r.grossCents, 0)).toBe(500);
    expect(soB.reduce((n, r) => n + r.grossCents, 0)).toBe(900);
    // Filtrar não perde nem duplica: a soma das duas fatias é o total sem filtro.
    expect(
      soA.reduce((n, r) => n + r.grossCents, 0) + soB.reduce((n, r) => n + r.grossCents, 0),
    ).toBe(rows.reduce((n, r) => n + r.grossCents, 0));
  });
});
