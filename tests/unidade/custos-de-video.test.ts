import { describe, expect, it } from "vitest";
import { formatEuro, formatPercent, formatUsd } from "@/lib/format";
import {
  DEFAULT_USD_TO_EUR,
  DELIVERY_USD_PER_1000_MINUTES,
  deliveryCostUsdCents,
  eventEconomics,
  MAX_SESSION_MINUTES,
  marginHealth,
  resolveUsdToEur,
  STORAGE_USD_PER_1000_MINUTES,
  storageCostUsdCents,
  totalEconomics,
  usdCentsToEurCents,
  videoCostShare,
} from "@/lib/video-costs";

/*
 * ============================================================================
 *  O CUSTO DO VÍDEO — aritmética pura, sem base de dados
 * ============================================================================
 *
 * O caso de referência atravessa este ficheiro todo, e é o real: a SmokingBars
 * com 131 pagantes a 8,50 € numa batalha de 3 h em que toda a gente vê tudo.
 *
 *     minutos   131 × 180                = 23 580
 *     entrega   23 580 / 1000 × 1 $      = 23,58 $
 *     receita   131 × 8,50 €             = 1 113,50 €
 *     comissão  131 × round(850 × 10 %)  = 131 × 85 = 111,35 €
 *
 * As contas acima estão feitas à mão de propósito: se o código mudar de fórmula,
 * é contra estes números que ele tem de continuar a bater.
 */

/*
 * Os formatadores separam o número do símbolo com um espaço INQUEBRÁVEL, para
 * que "21,69" e "€" nunca fiquem em linhas diferentes (lib/format.ts). Escrever
 * o esperado com um espaço normal dava um teste a falhar com duas strings de
 * aspeto idêntico no ecrã — daí o ` ` à vista.
 */
const NBSP = " ";

const CASO_SMOKINGBARS = {
  pagantes: 131,
  precoCents: 850,
  minutosPorPessoa: 180,
  comissaoPct: 10,
} as const;

const MINUTOS = CASO_SMOKINGBARS.pagantes * CASO_SMOKINGBARS.minutosPorPessoa; // 23 580

describe("preçário", () => {
  it("é o do Cloudflare Stream em julho de 2026", () => {
    expect(DELIVERY_USD_PER_1000_MINUTES).toBe(1);
    expect(STORAGE_USD_PER_1000_MINUTES).toBe(5);
  });
});

describe("custo de entrega", () => {
  it("dá 23,58 $ nos 23 580 minutos do caso de referência", () => {
    expect(MINUTOS).toBe(23_580);
    expect(deliveryCostUsdCents(MINUTOS)).toBe(2358);
    expect(formatUsd(deliveryCostUsdCents(MINUTOS))).toBe(`23,58${NBSP}$`);
  });

  it("cobra 1 $ por cada 1000 minutos, exatamente", () => {
    expect(deliveryCostUsdCents(1000)).toBe(100);
    expect(deliveryCostUsdCents(10_000)).toBe(1000);
  });

  /*
   * Um minuto custa um décimo de cêntimo. O arredondamento tem de acontecer UMA
   * vez, no total — se acontecesse por sessão, 10 sessões de 1 minuto davam
   * 10 × round(0,1) = 0 cêntimos em vez de 1.
   */
  it("arredonda uma vez, no fim", () => {
    expect(deliveryCostUsdCents(1)).toBe(0); // 0,1 cêntimos → 0
    expect(deliveryCostUsdCents(5)).toBe(1); // 0,5 → 1 (meio para cima)
    expect(deliveryCostUsdCents(10)).toBe(1); // 1,0 → 1
    expect(deliveryCostUsdCents(14)).toBe(1); // 1,4 → 1
    expect(deliveryCostUsdCents(15)).toBe(2); // 1,5 → 2
  });

  it("trata minutos impossíveis como zero, em vez de propagar lixo", () => {
    expect(deliveryCostUsdCents(0)).toBe(0);
    expect(deliveryCostUsdCents(-500)).toBe(0);
    expect(deliveryCostUsdCents(Number.NaN)).toBe(0);
    expect(deliveryCostUsdCents(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("custo de armazenamento", () => {
  it("cobra 5 $ por cada 1000 minutos guardados", () => {
    expect(storageCostUsdCents(1000)).toBe(500);
    expect(storageCostUsdCents(200)).toBe(100);
  });

  // Cinco vezes mais caro por minuto — é o que justifica não o misturar com a
  // entrega num número só.
  it("é cinco vezes o preço da entrega, para os mesmos minutos", () => {
    expect(storageCostUsdCents(MINUTOS)).toBe(deliveryCostUsdCents(MINUTOS) * 5);
  });
});

describe("câmbio", () => {
  it("converte dólares em euros à taxa dada", () => {
    // 23,58 $ × 0,92 = 21,6936 € → 21,69 €
    expect(usdCentsToEurCents(2358, 0.92)).toBe(2169);
    expect(formatEuro(usdCentsToEurCents(2358, 0.92))).toBe(`21,69${NBSP}€`);
  });

  it("aceita uma taxa do ambiente e recusa lixo", () => {
    expect(resolveUsdToEur("0.95")).toBe(0.95);
    expect(resolveUsdToEur("1")).toBe(1);
    // Sem valor, valor não numérico, negativo, zero ou absurdo → referência.
    for (const cru of [undefined, "", "abc", "-1", "0", "1e9"]) {
      expect(resolveUsdToEur(cru)).toBe(DEFAULT_USD_TO_EUR);
    }
  });
});

describe("peso do vídeo na comissão", () => {
  it("no caso de referência fica perto de um quinto", () => {
    const custoEur = usdCentsToEurCents(deliveryCostUsdCents(MINUTOS), DEFAULT_USD_TO_EUR);
    const comissao = CASO_SMOKINGBARS.pagantes * 85;

    expect(comissao).toBe(11_135);
    expect(custoEur).toBe(2169);
    // 2169 / 11135 = 0,1948…
    expect(videoCostShare(custoEur, comissao)).toBeCloseTo(0.1948, 4);
    expect(formatPercent(videoCostShare(custoEur, comissao) as number)).toBe(`19${NBSP}%`);
    expect(marginHealth(custoEur, comissao)).toBe("normal");
  });

  it("escala nos degraus certos", () => {
    expect(marginHealth(2499, 10_000)).toBe("normal");
    expect(marginHealth(2500, 10_000)).toBe("atencao"); // exatamente 25 %
    expect(marginHealth(4999, 10_000)).toBe("atencao");
    expect(marginHealth(5000, 10_000)).toBe("critico"); // exatamente 50 %
    expect(marginHealth(20_000, 10_000)).toBe("critico"); // custa o dobro do que rende
  });

  /*
   * Sem comissão a divisão não existe. O que NÃO pode acontecer é a ausência de
   * denominador virar "está tudo bem": um evento gratuito muito visto é entrega
   * paga com zero a entrar — o pior caso, não o melhor.
   */
  it("sem comissão, a fatia não existe mas o alarme dispara", () => {
    expect(videoCostShare(500, 0)).toBeNull();
    expect(marginHealth(500, 0)).toBe("critico");
    // Sem custo E sem comissão não há nada de errado a assinalar.
    expect(marginHealth(0, 0)).toBe("normal");
  });
});

describe("a conta de um evento", () => {
  const referencia = () =>
    eventEconomics({
      buyers: CASO_SMOKINGBARS.pagantes,
      unitPriceCents: CASO_SMOKINGBARS.precoCents,
      commissionPct: CASO_SMOKINGBARS.comissaoPct,
      delivery: { sessions: CASO_SMOKINGBARS.pagantes, minutes: MINUTOS, cappedSessions: 0 },
      usdToEur: DEFAULT_USD_TO_EUR,
    });

  it("bate certo, ao cêntimo, com a conta feita à mão", () => {
    const conta = referencia();

    expect(conta.revenueCents).toBe(111_350); // 1 113,50 €
    expect(conta.commissionCents).toBe(11_135); //   111,35 €
    expect(conta.videoCostUsdCents).toBe(2358); //    23,58 $
    expect(conta.videoCostEurCents).toBe(2169); //    21,69 €
    expect(conta.marginCents).toBe(8966); //    89,66 €
    // A margem é mesmo a subtração das duas colunas que estão no ecrã.
    expect(conta.commissionCents - (conta.videoCostEurCents as number)).toBe(conta.marginCents);
    expect(conta.health).toBe("normal");
  });

  /*
   * A COMISSÃO ARREDONDA POR COMPRA, e não sobre a receita agregada. É a mesma
   * regra do split (lib/split.ts) e do extrato mensal — sem ela, dois ecrãs que
   * dizem a mesma coisa divergiam em cêntimos que ninguém sabia explicar.
   */
  it("arredonda a comissão por compra, como o extrato mensal", () => {
    // 8,55 € a 10 % = 85,5 cêntimos → 86 por compra.
    const conta = eventEconomics({
      buyers: 131,
      unitPriceCents: 855,
      commissionPct: 10,
      delivery: null,
      usdToEur: DEFAULT_USD_TO_EUR,
    });

    expect(conta.commissionCents).toBe(131 * 86); // 11 266
    // A fórmula ingénua sobre a receita agregada dava 11 201 — 65 cêntimos a menos.
    expect(conta.commissionCents).not.toBe(Math.round((131 * 855 * 10) / 100));
  });

  /*
   * SEM DADOS NÃO É ZERO. Um evento sem uma única sessão medida não custou
   * "0,00 €" — não sabemos quanto custou, e o ecrã tem de dizer isso.
   */
  it("devolve nulos quando não há sessões medidas", () => {
    for (const delivery of [null, { sessions: 0, minutes: 0, cappedSessions: 0 }]) {
      const conta = eventEconomics({
        buyers: 10,
        unitPriceCents: 750,
        commissionPct: 10,
        delivery,
        usdToEur: DEFAULT_USD_TO_EUR,
      });

      // A receita e a comissão sabem-se sempre — o que falta é o custo.
      expect(conta.revenueCents).toBe(7500);
      expect(conta.commissionCents).toBe(750);
      expect(conta.minutes).toBeNull();
      expect(conta.videoCostUsdCents).toBeNull();
      expect(conta.videoCostEurCents).toBeNull();
      expect(conta.marginCents).toBeNull();
      expect(conta.health).toBeNull();
    }
  });

  it("uma sessão de duração zero conta como dados, e o custo é mesmo zero", () => {
    const conta = eventEconomics({
      buyers: 1,
      unitPriceCents: 750,
      commissionPct: 10,
      delivery: { sessions: 1, minutes: 0, cappedSessions: 0 },
      usdToEur: DEFAULT_USD_TO_EUR,
    });

    // Alguém abriu e fechou: sabemos que não custou nada. Diferente de "—".
    expect(conta.minutes).toBe(0);
    expect(conta.videoCostEurCents).toBe(0);
    expect(conta.marginCents).toBe(75);
  });
});

describe("totais", () => {
  const conta = (buyers: number, minutes: number | null) =>
    eventEconomics({
      buyers,
      unitPriceCents: 850,
      commissionPct: 10,
      delivery: minutes === null ? null : { sessions: buyers, minutes, cappedSessions: 0 },
      usdToEur: DEFAULT_USD_TO_EUR,
    });

  it("somam os valores já arredondados de cada linha", () => {
    const linhas = [conta(131, 23_580), conta(50, 9000)];
    const total = totalEconomics(linhas);

    // A linha de total tem de ser a soma visível das linhas de cima, ao cêntimo.
    expect(total.revenueCents).toBe(linhas[0].revenueCents + linhas[1].revenueCents);
    expect(total.commissionCents).toBe(linhas[0].commissionCents + linhas[1].commissionCents);
    expect(total.videoCostEurCents).toBe(
      (linhas[0].videoCostEurCents as number) + (linhas[1].videoCostEurCents as number),
    );
    expect(total.marginCents).toBe(total.commissionCents - total.videoCostEurCents);
    expect(total.minutes).toBe(32_580);
    expect(total.eventsWithoutDelivery).toBe(0);
  });

  /*
   * O total com eventos sem dados é um LIMITE SUPERIOR da margem, e a contagem
   * sai daqui para o ecrã o poder confessar. Somar o desconhecido como zero e
   * calar isso era dar uma margem melhor do que a real.
   */
  it("contam quantos eventos ficaram sem dados de visionamento", () => {
    const total = totalEconomics([conta(131, 23_580), conta(50, null), conta(20, null)]);

    expect(total.eventsWithoutDelivery).toBe(2);
    // O custo somado é só o do evento medido.
    expect(total.videoCostEurCents).toBe(2169);
    // Mas a comissão conta os três — é a margem que fica otimista.
    expect(total.commissionCents).toBe((131 + 50 + 20) * 85);
  });

  it("de uma lista vazia dão zeros e nenhum alarme", () => {
    const total = totalEconomics([]);

    expect(total.revenueCents).toBe(0);
    expect(total.commissionCents).toBe(0);
    expect(total.videoCostEurCents).toBe(0);
    expect(total.marginCents).toBe(0);
    expect(total.costShare).toBeNull();
    expect(total.health).toBe("normal");
    expect(total.eventsWithoutDelivery).toBe(0);
  });
});

describe("o teto por sessão", () => {
  it("são 12 horas, e é o mesmo número que a query usa", () => {
    // A query interpola esta constante (server/stats.ts). Se alguém a mudar
    // aqui, muda nos dois sítios — que é precisamente o objetivo.
    expect(MAX_SESSION_MINUTES).toBe(720);
  });
});
