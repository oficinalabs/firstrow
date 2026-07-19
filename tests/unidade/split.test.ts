import { afterEach, describe, expect, it } from "vitest";
import { buildSplit } from "@/lib/split";

/*
 * ============================================================================
 *  O SPLIT — o cálculo que decide quanto fica para a liga
 * ============================================================================
 *
 * Este é dinheiro de outra pessoa. Um cêntimo a mais na parte da plataforma é
 * um cêntimo a menos na da liga, multiplicado por todas as vendas, e ninguém
 * vai dar por isso a olhar para o ecrã.
 *
 * O que estes testes seguram é UM invariante acima de tudo: as duas partes
 * somam EXATAMENTE o que o cliente pagou. Nem um cêntimo perdido (a Eupago
 * recusa o pedido), nem um cêntimo inventado (idem). O resto — a percentagem
 * estar certa — vem a seguir.
 */

const CHAVES = {
  EUPAGO_LEAGUE_EXTERNKEY: "liga-abc",
  EUPAGO_PLATFORM_EXTERNKEY: "plataforma-abc",
};

function comAmbiente(extra: Record<string, string>): void {
  for (const [k, v] of Object.entries({ ...CHAVES, ...extra })) {
    process.env[k] = v;
  }
}

afterEach(() => {
  for (const k of [...Object.keys(CHAVES), "PLATFORM_COMMISSION_PCT"]) {
    delete process.env[k];
  }
});

/** As duas parcelas em cêntimos — comparar em euros herdava o erro do float. */
function emCentimos(partes: { amount: number }[]): number[] {
  return partes.map((p) => Math.round(p.amount * 100));
}

describe("buildSplit", () => {
  it("dá à plataforma a percentagem configurada e o resto à liga", () => {
    comAmbiente({ PLATFORM_COMMISSION_PCT: "10" });

    const [liga, plataforma] = buildSplit(7.5);

    expect(plataforma.amount).toBe(0.75);
    expect(liga.amount).toBe(6.75);
    expect(liga.externKey).toBe("liga-abc");
    expect(plataforma.externKey).toBe("plataforma-abc");
  });

  /*
   * O teste que interessa mesmo. Percorre todos os preços de 0,01 € a 100,00 €
   * com várias comissões: se alguma combinação perder ou inventar um cêntimo,
   * aparece aqui e não numa reconciliação daqui a três meses.
   */
  it.each(["0", "5", "10", "12.5", "20", "33.33", "100"])(
    "as duas partes somam sempre o valor pago (comissão %s%%)",
    (pct) => {
      comAmbiente({ PLATFORM_COMMISSION_PCT: pct });

      const desvios: string[] = [];
      for (let centimos = 1; centimos <= 10_000; centimos++) {
        const [liga, plataforma] = buildSplit(centimos / 100);
        const soma = emCentimos([liga, plataforma]).reduce((a, b) => a + b, 0);
        if (soma !== centimos) desvios.push(`${centimos}c -> ${soma}c`);
      }

      expect(desvios).toEqual([]);
    },
  );

  it("nunca atribui uma parte negativa", () => {
    comAmbiente({ PLATFORM_COMMISSION_PCT: "100" });

    for (const partes of [buildSplit(0.01), buildSplit(7.5), buildSplit(100)]) {
      for (const parte of partes) {
        expect(parte.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  /*
   * Sem comissão configurada valem 10% — é o valor por omissão do código.
   * Fica aqui preso porque mudá-lo em silêncio muda o que cada liga recebe.
   */
  it("assume 10% quando PLATFORM_COMMISSION_PCT não está definida", () => {
    comAmbiente({});

    const [liga, plataforma] = buildSplit(10);

    expect(plataforma.amount).toBe(1);
    expect(liga.amount).toBe(9);
  });

  /*
   * Preço a zero (evento gratuito) não pode produzir NaN nem negativos — a
   * chamada à Eupago rebentaria com uma mensagem que não diz nada.
   */
  it("aguenta um valor de zero", () => {
    comAmbiente({ PLATFORM_COMMISSION_PCT: "10" });

    const partes = buildSplit(0);

    expect(emCentimos(partes)).toEqual([0, 0]);
  });
});
