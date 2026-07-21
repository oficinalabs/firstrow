import { describe, expect, it } from "vitest";
import { formatEuro, formatPercent, formatRate } from "@/lib/format";

/*
 * ============================================================================
 *  PERCENTAGENS: O QUE SE MEDE vs O QUE SE CONTRATA
 * ============================================================================
 *
 * Este ficheiro existe por causa de um erro real, apanhado nesta frente ao ler
 * o formatador — não o ecrã.
 *
 * Ao tirar a taxa da Eupago de dentro do SQL para uma constante, a frase do
 * rodapé de `/admin/ganhos` passou a ser montada com `formatPercent`. Parecia
 * óbvio: é uma percentagem. Mas `formatPercent` arredonda à percentagem
 * INTEIRA, e a taxa é 0,7 % — saiu "1 %" no ecrã. Uma taxa 43 % maior do que a
 * real, impressa por baixo da tabela que uma liga usa para conferir, ao
 * cêntimo, o dinheiro que lhe é devido.
 *
 * O arredondamento estava certo para o que `formatPercent` serve (proporções
 * medidas, onde as casas são ruído) e errado para o que lhe foi dado (um número
 * de contrato). A separação em duas funções é a correção; estes testes são o
 * que impede que voltem a fundir-se.
 *
 * ⚠️  O ESPAÇO ANTES DO SÍMBOLO É U+00A0, e está escrito como ` ` de
 * propósito. A primeira versão deste ficheiro tinha um espaço normal nos
 * literais esperados e falhou com "Expected: 0,7 % / Received: 0,7 %" — duas
 * cadeias visualmente idênticas. Um carácter invisível não se escreve à mão num
 * teste: escreve-se como escape, para o próximo a ler saber que está lá.
 */

/** O espaço inquebrável que `lib/format.ts` põe antes de "%" e de "€". */
const NBSP = " ";

describe("formatPercent — proporções MEDIDAS, arredondadas ao inteiro", () => {
  it("arredonda ao inteiro, que é o que serve o peso na comissão", () => {
    expect(formatPercent(0.195)).toBe(`20${NBSP}%`);
    expect(formatPercent(0.25)).toBe(`25${NBSP}%`);
    expect(formatPercent(1)).toBe(`100${NBSP}%`);
  });

  /*
   * O comportamento que causou o erro, escrito como facto e não como surpresa.
   * Se alguém "corrigir" `formatPercent` para ter casas decimais, é aqui que
   * fica a saber que há ecrãs a contar com o arredondamento.
   */
  it("uma taxa abaixo de 1 % é destruída por ele — é por isto que existe formatRate", () => {
    expect(formatPercent(0.007)).toBe(`1${NBSP}%`);
    expect(formatPercent(0.004)).toBe(`0${NBSP}%`);
  });
});

describe("formatRate — taxas CONTRATADAS, com as casas que têm", () => {
  it("a taxa da Eupago sai como está no contrato", () => {
    expect(formatRate(0.007)).toBe(`0,7${NBSP}%`);
  });

  it("não inventa casas nem as perde", () => {
    expect(formatRate(0.1)).toBe(`10,0${NBSP}%`);
    expect(formatRate(0.0025, 2)).toBe(`0,25${NBSP}%`);
    expect(formatRate(0.007, 2)).toBe(`0,70${NBSP}%`);
  });

  it("usa vírgula decimal, nunca ponto", () => {
    expect(formatRate(0.007)).toContain(",");
    expect(formatRate(0.007)).not.toContain(".");
  });
});

/*
 * A frase do rodapé, montada como a página a monta. É o par de valores que uma
 * liga lê para conferir o extrato — e é o que estava errado.
 */
describe("a frase da taxa Eupago, tal como sai no extrato", () => {
  it("diz 0,07 € + 0,7 %", () => {
    const EUPAGO_FIXED_FEE_CENTS = 7;
    const EUPAGO_VARIABLE_RATE = 0.007;
    expect(`${formatEuro(EUPAGO_FIXED_FEE_CENTS)} + ${formatRate(EUPAGO_VARIABLE_RATE)}`).toBe(
      `0,07${NBSP}€ + 0,7${NBSP}%`,
    );
  });
});
