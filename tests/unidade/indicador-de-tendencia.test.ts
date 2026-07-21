import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrendBadge } from "@/components/admin/charts/trend-badge";
import type { Trend } from "@/server/stats";

/*
 * ============================================================================
 *  O INDICADOR DE TENDÊNCIA — cor E texto, nunca só cor
 * ============================================================================
 *
 * A regra do dono, medida em vez de afirmada: a direção tem de chegar por
 * TEXTO e por SETA, e não só pela cor. Quem não distingue verde de vermelho, e
 * qualquer leitor de ecrã, tem de perceber se subiu ou desceu. Estes testes
 * renderizam o componente e leem o markup — se um dia alguém deixar a direção
 * só na cor, uma destas linhas fica vermelha.
 *
 * É um render puro (sem base de dados): o `Trend` entra como tipo, e o
 * componente só depende de `lib/format` e de `lucide-react`.
 */

const trend = (current: number, previous: number): Trend => ({
  current,
  previous,
  deltaRatio: previous === 0 ? null : (current - previous) / previous,
});

function render(t: Trend, invert = false): string {
  return renderToStaticMarkup(createElement(TrendBadge, { trend: t, invert }));
}

describe("indicador de tendência", () => {
  it("a subir: palavra, percentagem, seta e a cor de sucesso", () => {
    const html = render(trend(140, 100)); // +40 %
    expect(html).toContain("subiu 40"); // a PALAVRA e o número, não só a cor
    expect(html).toContain("text-success"); // e TAMBÉM a cor
    expect(html).toContain("<svg"); // a seta desenhada (não emoji)
    // A frase que o leitor de ecrã ouve — a leitura sem cor nem seta.
    expect(html).toContain("Subiu 40");
    expect(html).toContain("face ao período anterior");
    expect(html).toContain("sr-only");
  });

  it("a descer: palavra própria e a cor destrutiva", () => {
    const html = render(trend(60, 100)); // −40 %
    expect(html).toContain("desceu 40");
    expect(html).toContain("text-destructive");
    expect(html).toContain("Desceu 40");
  });

  it("igual: «sem mudança», neutro, e sem percentagem a fingir de variação", () => {
    const html = render(trend(100, 100));
    expect(html).toContain("sem mudança");
    expect(html).toContain("text-muted-foreground");
    expect(html).not.toContain("subiu");
    expect(html).not.toContain("desceu");
    expect(html).not.toContain("%");
    expect(html).toContain("Sem mudança face ao período anterior");
  });

  it("sem período anterior: «novo», sem seta de subida nem percentagem inventada", () => {
    const html = render(trend(50, 0)); // deltaRatio === null, atual > 0
    expect(html).toContain("novo");
    expect(html).not.toContain("subiu"); // «novo» NÃO é «subiu 100 %»
    expect(html).not.toContain("%");
    expect(html).toContain("text-muted-foreground"); // sem juízo de bom/mau
    expect(html).toContain("Novo neste período");
  });

  it("sem atividade nenhuma: ambos a zero dá «sem atividade», nunca uma seta", () => {
    const html = render(trend(0, 0));
    expect(html).toContain("sem atividade");
    expect(html).not.toContain("%");
    expect(html).toContain("Sem atividade neste período");
  });

  it("`invert`: numa métrica onde descer é bom, a cor troca mas a palavra não", () => {
    // Subir numa métrica invertida (ex.: bloqueios) é MAU → vermelho.
    const subiuMau = render(trend(140, 100), true);
    expect(subiuMau).toContain("subiu 40"); // a direção real não mente
    expect(subiuMau).toContain("text-destructive"); // mas a cor diz que é mau

    // Descer nessa métrica é BOM → verde.
    const desceuBom = render(trend(60, 100), true);
    expect(desceuBom).toContain("desceu 40");
    expect(desceuBom).toContain("text-success");
  });
});
