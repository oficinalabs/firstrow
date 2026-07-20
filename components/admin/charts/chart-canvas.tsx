"use client";

import dynamic from "next/dynamic";
import type { ChartSpec } from "@/components/admin/charts/series";

/*
 * ============================================================================
 *  A FRONTEIRA DO CARREGAMENTO — o recharts entra por aqui e por mais lado nenhum
 * ============================================================================
 *
 * `ssr: false` faz duas coisas ao mesmo tempo, e as duas interessam:
 *
 *  1. A biblioteca NÃO entra no bundle do servidor nem no do cliente inicial.
 *     Desce num pedido à parte, e só quando uma página com gráficos abre. O
 *     resto da plataforma — a home, a página do evento, o checkout — não paga
 *     um byte por isto.
 *
 *  2. O gráfico não existe no HTML da resposta. É o que obriga a que os dados
 *     estejam noutro lado — e estão: cada gráfico é acompanhado da TABELA com
 *     os mesmos números, desenhada no servidor. Sem JavaScript, com um leitor
 *     de ecrã, ou enquanto o pedaço não chega, a informação continua toda lá.
 *     O gráfico é a leitura rápida, nunca a única leitura.
 *
 * O esqueleto tem exatamente a altura do gráfico que vai substituir. Sem isso,
 * a página saltava para baixo a cada gráfico que acabasse de carregar, e numa
 * dashboard com cinco isso é a página inteira a dançar.
 */

const ChartKit = dynamic(
  () => import("@/components/admin/charts/chart-kit").then((m) => m.ChartKit),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse rounded-sm bg-muted" />,
  },
);

export function ChartCanvas({ spec }: { spec: ChartSpec }) {
  const altura = spec.height ?? 240;

  return (
    /*
     * `aria-hidden` no invólucro do desenho: quem usa leitor de ecrã não ganha
     * nada com uma árvore de <path> e <g> lida em voz alta, e o mesmo conteúdo
     * está na tabela por baixo, que é navegável célula a célula. Esconder o
     * ruído É a decisão acessível aqui — não é abdicar dela.
     */
    <div aria-hidden="true" style={{ height: altura }} className="w-full">
      <ChartKit spec={spec} />
    </div>
  );
}
