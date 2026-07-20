import type { Channel } from "@/lib/channels";
import { derivePaletteCached } from "@/lib/colors";

/*
 * ============================================================================
 *  O CONTRATO DOS GRÁFICOS — puro, sem React e sem recharts
 * ============================================================================
 *
 * Está separado para que o servidor possa montar séries sem arrastar a
 * biblioteca de gráficos para o bundle dele: quem calcula os dados importa
 * daqui, quem os desenha importa do `chart-kit`. São 30 linhas de tipos, mas
 * são a fronteira que mantém o recharts inteiramente do lado do cliente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  AS CORES NÃO SE INVENTAM AQUI — VÊM DE UM DE DOIS SÍTIOS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. TOKENS do design system, como `var(--color-success)`. Não é uma string
 *    solta a fingir de token: o SVG do recharts vive dentro da página, por isso
 *    a variável resolve-se lá como em qualquer outro elemento — e uma mudança
 *    de paleta no `globals.css` chega aos gráficos sem se tocar neste ficheiro.
 *
 * 2. A COR DA PRÓPRIA LIGA, quando a série é um canal, passada pela derivação
 *    de `lib/colors.ts` — a mesma que o avatar e o filete do canal já usam. Ou
 *    seja: a série de um canal tem exatamente a cor por que esse canal é
 *    conhecido no resto da plataforma, e não uma cor de uma paleta de gráficos
 *    inventada ao lado.
 *
 * Porquê `solid` e não `accent`: `solid` é o tom garantido a 3:1 contra as
 * superfícies (WCAG 1.4.11, elementos não textuais) — que é exatamente o que
 * uma barra ou uma linha é. O `accent` é para TEXTO e mede-se a 4,5:1, o que o
 * empurra mais escuro do que uma área preenchida precisa.
 *
 * O QUE ISTO NÃO RESOLVE, e tem de ficar dito: duas ligas que escolham cores
 * parecidas ficam com séries parecidas. Não se corrige à força — a cor é delas
 * e mudá-la no gráfico era mentir sobre quem é quem. Corrige-se com o que está
 * à volta: legenda com o nome de cada série, e a TABELA com os mesmos números.
 * Nenhum gráfico daqui comunica seja o que for só pela cor.
 */

export type ChartSeries = {
  /** Identifica a série nos pontos. Id de canal, ou uma chave nossa ("ppv"). */
  key: string;
  /** O que aparece na legenda e na tabela. */
  label: string;
  /** Token CSS (`var(--color-…)`) ou hex já derivado da marca do canal. */
  color: string;
};

export type ChartPoint = {
  /** Rótulo do eixo X, JÁ formatado em PT-PT — o gráfico não formata datas. */
  x: string;
  /** Valor por chave de série. Dinheiro em CÊNTIMOS; contagens em unidades. */
  values: Record<string, number>;
};

/** Como se lê um valor: decide o eixo, a etiqueta e a casa decimal. */
export type ValueKind = "money" | "count";

export type ChartKind = "stacked-bars" | "grouped-bars" | "line";

export type ChartSpec = {
  kind: ChartKind;
  series: readonly ChartSeries[];
  points: readonly ChartPoint[];
  valueKind: ValueKind;
  /** Altura em px. O eixo X precisa de espaço; abaixo de 180 fica ilegível. */
  height?: number;
};

/** A cor de marca de um canal, pronta a pintar uma série. */
export function channelSeriesColor(channel: Channel | undefined): string {
  // Sem canal (linha órfã), o neutro do sistema — nunca uma cor à sorte, que
  // daria a duas ligas diferentes a mesma identidade visual por acidente.
  if (!channel) return "var(--color-muted-foreground)";
  return derivePaletteCached(channel, "light").palette.solid;
}

/*
 * As séries que não são canais. Todas saem de tokens, e a escolha de cada uma
 * segue o significado que ela já tem no resto do backoffice:
 *
 *   receita/comissão  → o que entra. `success`, como o `hintTone` do StatCard.
 *   custo             → o que sai. `destructive`, como as colunas de taxa do
 *                       extrato e do bloco de economia por evento.
 *   bilhetes          → limão, o marcador da marca (nunca em CTAs; uma barra
 *                       não é um CTA).
 *   PPV               → grafite, o neutro forte.
 */
export const TOKEN_SERIES = {
  ppv: "var(--color-graphite)",
  bilhetes: "var(--color-accent)",
  comissao: "var(--color-success)",
  custo: "var(--color-destructive)",
  espectadores: "var(--color-live)",
  convertidos: "var(--color-success)",
  registos: "var(--color-muted-foreground)",
} as const;
