import { ChartCanvas } from "@/components/admin/charts/chart-canvas";
import type { ChartSpec } from "@/components/admin/charts/series";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/*
 * ============================================================================
 *  O INVÓLUCRO DOS GRÁFICOS — há UM, e é este
 * ============================================================================
 *
 * Cinco gráficos, cinco vezes a mesma moldura: cartão, título, legenda,
 * desenho, tabela, nota de rodapé. Escrever isso cinco vezes era garantir que
 * ao terceiro alguém esquecia a tabela — e a tabela é a parte acessível.
 * Aqui a moldura é obrigatória por construção: não há como pôr um gráfico na
 * página sem lhe dar a tabela, porque a prop não é opcional.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  SEM DADOS, DIZ-SE — E É AQUI QUE SE DECIDE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `hasData: false` NÃO desenha um gráfico a zeros. Um eixo com uma linha
 * assente no fundo parece uma medição — parece que se mediu e deu zero — e a
 * diferença entre "ninguém comprou" e "ainda não há nada para medir" é
 * exactamente a diferença entre um facto e um ecrã vazio a fingir que é um.
 * É a mesma regra que o `getDeliveryByEvent` já segue ao devolver "—" em vez
 * de "0,00 €" para um evento sem sessões.
 *
 * Baldes vazios DENTRO de um período com movimento são outra coisa e esses
 * desenham-se a zero de propósito: aí o zero é mesmo o que aconteceu.
 */

export function ChartCard({
  title,
  description,
  meta,
  hasData,
  empty,
  spec,
  table,
  footnote,
}: {
  title: string;
  description?: string;
  /** Canto superior direito — período, unidade, o que situe o gráfico. */
  meta?: React.ReactNode;
  hasData: boolean;
  empty: { title: string; description: string };
  spec: ChartSpec;
  /**
   * A MESMA informação do gráfico, em tabela. Obrigatória — ver o cabeçalho.
   * Fica dentro de um `<details>`: acessível ao teclado e ao leitor de ecrã,
   * sem esticar a página cinco vezes para quem só quer a leitura rápida.
   */
  table: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <p className="text-2sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {meta ? (
          <span className="font-mono text-2xs uppercase tracking-label text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {hasData ? (
          <>
            {/*
              A legenda é HTML do servidor e não a `<Legend>` do recharts: assim
              existe no corpo da resposta, é lida por um leitor de ecrã e
              sobrevive a um pedaço de JavaScript que não chegue. Cada série
              leva o NOME ao lado da cor — nunca só a cor.
            */}
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {spec.series.map((serie) => (
                <li key={serie.key} className="flex items-center gap-1.5 text-2sm">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-xs border border-border"
                    style={{ background: serie.color }}
                  />
                  <span className="text-muted-foreground">{serie.label}</span>
                </li>
              ))}
            </ul>

            <ChartCanvas spec={spec} />

            <details className="group">
              <summary className="cursor-pointer list-none font-mono text-2xs uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground">
                <span className="underline underline-offset-4">
                  Tabela de dados
                  {/* O estado do <details> não é dito só pela seta: o texto
                      muda com ele, para quem não vê o triângulo. */}
                  <span className="group-open:hidden"> · mostrar</span>
                  <span className="hidden group-open:inline"> · esconder</span>
                </span>
              </summary>
              {/*
                A tabela rola SOZINHA na horizontal quando não cabe. É o que
                impede que uma tabela larga empurre a página inteira para o
                lado a 375px — o corpo nunca rola na horizontal, a tabela sim.
              */}
              <div className="mt-2.5 overflow-x-auto">{table}</div>
            </details>
          </>
        ) : (
          <EmptyState title={empty.title} description={empty.description} />
        )}

        {footnote ? (
          <p className="border-t-2 border-accent pt-2.5 font-mono text-2xs leading-relaxed text-muted-foreground">
            {footnote}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
