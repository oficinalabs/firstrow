import type { Metadata } from "next";
import Link from "next/link";
import { ChannelTabs } from "@/components/admin/channel-tabs";
import { DataTable } from "@/components/admin/data-table";
import { EventEconomics } from "@/components/admin/event-economics";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodTabs } from "@/components/admin/period-tabs";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatEuro, formatNumber, formatRate } from "@/lib/format";
import { isPlatformAdmin, manageScope, requireBackofficePage } from "@/server/authz";
import { channelsInScope } from "@/server/channels";
import {
  EUPAGO_FIXED_FEE_CENTS,
  EUPAGO_VARIABLE_RATE,
  getMonthlyStatement,
  getPlatformEconomics,
  type MonthlyStatementRow,
  type PeriodKey,
  resolvePeriod,
} from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ganhos" };

/*
 * O extrato é do dinheiro DOS CANAIS desta pessoa. Sem âmbito, esta era a
 * página que somava a faturação de todas as ligas na mesma tabela.
 *
 * Com mais do que um canal, filtrar deixa de chegar: uma linha por mês seria
 * um total que não se pode pagar a ninguém, porque cada liga recebe o seu.
 * Aí a tabela ganha a coluna do canal e passa a haver uma linha por mês E por
 * canal — o total no fundo continua a ser o mesmo dinheiro.
 *
 * O FILTRO DE CANAL (ChannelTabs) é sobre isto: com muitas ligas, ver as duas
 * dúzias de linhas de todas ao mesmo tempo é ruído quando só se quer conferir
 * uma. Filtrar por canal não muda o cálculo — é a mesma `getMonthlyStatement`,
 * só que depois se olha para menos linhas dela.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE A ECONOMIA POR EVENTO É SÓ PARA A FIRSTROW
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O custo do vídeo é da PLATAFORMA, não da liga: sai da comissão que a FirstRow
 * cobra, e não do líquido que a liga recebe. Pô-lo na tabela do extrato dizia a
 * um dono de liga que ele paga uma coisa que não paga — e o extrato existe
 * precisamente para ele conseguir conferir, ao cêntimo, o que lhe é devido.
 *
 * Por isso o bloco novo é um bloco à parte, com o gate `isPlatformAdmin`, e o
 * extrato fica exatamente como estava para quem gere uma liga. (Se um dia se
 * decidir passar o custo à liga, é aqui que a decisão se inverte — e aí passa a
 * ser uma linha do extrato, não um bloco separado.)
 *
 * O GATE É UMA CONDIÇÃO ANTES DO `await`, e não um `{cond && <bloco/>}` no JSX.
 * A diferença não é de estilo: layout e página renderizam em paralelo no App
 * Router, e dados já lidos entram no payload do RSC mesmo quando o componente
 * que os mostra não chega a ser desenhado — foi assim que o backoffice fugia
 * antes do corte no `proxy.ts` (ver a medição lá). Não buscar é a única forma
 * de não revelar.
 */
export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Defesa em profundidade: o proxy já corta, mas uma página de dinheiro não
  // pode depender só dele — se um dia a porta alargar, esta linha segura.
  const user = await requireBackofficePage("/admin/ganhos");
  const scope = manageScope(user);

  const params = await searchParams;
  const period = resolvePeriod(params.periodo);
  const canalPedido = typeof params.canal === "string" ? params.canal : null;

  const [{ commissionPct, rows: todasAsLinhas }, channels, economics] = await Promise.all([
    getMonthlyStatement(scope, period),
    channelsInScope(scope),
    // O âmbito vai à mesma, apesar de o gate garantir hoje `{ all: true }`:
    // uma query de dinheiro sem âmbito é uma fuga à espera de que alguém
    // alargue o gate. Ver `inScope` em `server/authz.ts`.
    isPlatformAdmin(user) ? getPlatformEconomics(scope, period) : Promise.resolve(null),
  ]);

  // O canal pedido só é válido se estiver dentro do âmbito desta conta — um
  // id de fora (escrito à mão no URL) cai em "Todos", nunca noutro canal.
  const canalValido = canalPedido && channels.byId.has(canalPedido) ? canalPedido : null;
  const rows = canalValido
    ? todasAsLinhas.filter((r) => r.channelId === canalValido)
    : todasAsLinhas;

  const totals = rows.reduce(
    (acc, r) => ({
      ppvPurchases: acc.ppvPurchases + r.ppvPurchases,
      ticketsSold: acc.ticketsSold + r.ticketsSold,
      grossCents: acc.grossCents + r.grossCents,
      firstrowFeeCents: acc.firstrowFeeCents + r.firstrowFeeCents,
      eupagoFeeCents: acc.eupagoFeeCents + r.eupagoFeeCents,
      netCents: acc.netCents + r.netCents,
    }),
    {
      ppvPurchases: 0,
      ticketsSold: 0,
      grossCents: 0,
      firstrowFeeCents: 0,
      eupagoFeeCents: 0,
      netCents: 0,
    },
  );

  // Com uma liga que ainda não vendeu um único bilhete, a coluna era uma coluna
  // de zeros a roubar espaço ao que interessa. A mesma regra da coluna "Canal":
  // só aparece quando tem alguma coisa para dizer.
  const temBilhetes = rows.some((r) => r.ticketsSold > 0);
  // Com um canal escolhido, a coluna "Canal" também deixa de dizer nada novo —
  // todas as linhas seriam da mesma liga.
  const mostraColunaCanal = channels.many && !canalValido;

  // Os links preservam sempre o outro filtro: trocar de período não pode fazer
  // perder o canal escolhido, e vice-versa.
  const hrefForPeriod = (destino: PeriodKey) => {
    const query = new URLSearchParams({ periodo: destino });
    if (canalValido) query.set("canal", canalValido);
    return `/admin/ganhos?${query.toString()}`;
  };
  const hrefForChannel = (destino: string | null) => {
    const query = new URLSearchParams({ periodo: period });
    if (destino) query.set("canal", destino);
    return `/admin/ganhos?${query.toString()}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Ganhos"
        meta={
          channels.many
            ? `${formatNumber(channels.list.length)} canais · bruto → taxas → líquido`
            : "bruto → taxas → líquido, sempre ao cêntimo"
        }
        action={<PeriodTabs current={period} hrefFor={hrefForPeriod} />}
      />

      {channels.many ? (
        <ChannelTabs channels={channels.list} current={canalValido} hrefFor={hrefForChannel} />
      ) : null}

      {/* Primeiro o que é novo e urgente — a fatura da Cloudflare não espera
          pelo fecho do mês. O extrato, que já se conhece, fica por baixo. */}
      {economics ? <EventEconomics economics={economics} channels={channels} /> : null}

      {rows.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-2">
            <DataTable<MonthlyStatementRow>
              columns={[
                {
                  header: "Mês",
                  destaque: true,
                  cell: (r) => <span className="font-semibold">{r.monthLabel}</span>,
                },
                // A quem se paga esta linha. Só com mais do que um canal E sem
                // um já escolhido — com um só (por seleção ou por não haver
                // outro), é a mesma liga em todas as linhas.
                ...(mostraColunaCanal
                  ? [
                      {
                        header: "Canal",
                        cell: (r: MonthlyStatementRow) => (
                          <span className="text-xs text-muted-foreground">
                            {channels.byId.get(r.channelId)?.name ?? "—"}
                          </span>
                        ),
                      },
                    ]
                  : []),
                /*
                 * As duas origens do dinheiro, em contagens separadas. O "Bruto"
                 * ao lado é a soma das duas — mas quem lê o extrato precisa de
                 * saber se vendeu online ou à porta, e um número só não o diz.
                 */
                { header: "Acessos", numeric: true, cell: (r) => formatNumber(r.ppvPurchases) },
                ...(temBilhetes
                  ? [
                      {
                        header: "Bilhetes",
                        numeric: true,
                        cell: (r: MonthlyStatementRow) => formatNumber(r.ticketsSold),
                      },
                    ]
                  : []),
                { header: "Bruto", numeric: true, cell: (r) => formatEuro(r.grossCents) },
                {
                  header: `Taxa FirstRow · ${commissionPct}%`,
                  numeric: true,
                  className: "text-destructive",
                  cell: (r) => formatEuro(-r.firstrowFeeCents),
                },
                {
                  header: "Taxa Eupago · est.",
                  numeric: true,
                  className: "text-destructive",
                  cell: (r) => formatEuro(-r.eupagoFeeCents),
                },
                {
                  header: "Líquido",
                  numeric: true,
                  className: "font-semibold",
                  cell: (r) => formatEuro(r.netCents),
                },
              ]}
              rows={rows}
              // Uma linha é um mês DE UM canal — o mês sozinho deixou de ser único.
              rowKey={(r) => `${r.monthKey}·${r.channelId}`}
              footer={
                /*
                 * A linha de total não pode ler-se como mais uma linha de dados —
                 * é a resposta à pergunta que a tabela inteira existe para
                 * responder. `bg-muted` + `font-semibold` na LINHA (não em cada
                 * célula) bastam: o fundo pinta o cartão inteiro em modo cartão
                 * (confirmado a 375px — a tinta cobre o bloco todo, não célula a
                 * célula) e o peso da fonte herda para todo o texto lá dentro.
                 *
                 * Uma borda superior mais grossa foi tentada e descartada: teria
                 * de ir em cada `TableCell` (o `TableBody` traz
                 * `[&_tr:last-child]:border-0`, que zera uma borda posta na
                 * própria `<tr>` — esta linha é a última do `<tbody>`). Isso
                 * funciona em modo tabela (uma linha só, a atravessar a linha),
                 * mas em modo cartão cada célula vira o seu próprio bloco
                 * empilhado — a mesma borda sai UMA VEZ POR CAMPO, não uma vez
                 * no topo do cartão. Visto a 375px antes de escolher: fundo +
                 * peso chegam, e não partem o cartão.
                 */
                <TableRow className="bg-muted font-semibold hover:bg-muted">
                  {/*
                    `label` em cada célula: sem ele, o modo cartão (que tira o
                    rótulo do `data-rotulo` de cada CÉLULA, não da coluna) mostra
                    esta linha como números soltos, sem dizer que "31,00 €" é o
                    Bruto — as linhas de dados têm o rótulo porque vêm de
                    `columns[].header`, mas esta linha é escrita à mão e não
                    passa por ali. Repete-se o mesmo texto do cabeçalho da
                    coluna, para o total ler-se igual às linhas de cima.
                  */}
                  <TableCell label="Mês">Total</TableCell>
                  {mostraColunaCanal ? <TableCell label="Canal" /> : null}
                  <TableCell numeric label="Acessos">
                    {formatNumber(totals.ppvPurchases)}
                  </TableCell>
                  {temBilhetes ? (
                    <TableCell numeric label="Bilhetes">
                      {formatNumber(totals.ticketsSold)}
                    </TableCell>
                  ) : null}
                  <TableCell numeric label="Bruto">
                    {formatEuro(totals.grossCents)}
                  </TableCell>
                  <TableCell
                    numeric
                    label={`Taxa FirstRow · ${commissionPct}%`}
                    className="text-destructive"
                  >
                    {formatEuro(-totals.firstrowFeeCents)}
                  </TableCell>
                  <TableCell numeric label="Taxa Eupago · est." className="text-destructive">
                    {formatEuro(-totals.eupagoFeeCents)}
                  </TableCell>
                  <TableCell numeric label="Líquido">
                    {formatEuro(totals.netCents)}
                  </TableCell>
                </TableRow>
              }
            />
            {/*
              `<details>` nativo: acessível de origem (o `<summary>` já é
              focável e anunciado por leitor de ecrã como um disclosure, sem
              JavaScript nenhum). O texto não desaparece — só deixa de ser a
              primeira coisa que se vê ao abrir a página, que era o pedido: a
              informação existe para quem a procura, não para quem só quer o
              número de cima.

              A frase monta-se em JavaScript e entra inteira: em JSX, o espaço
              entre uma expressão e o texto que lhe segue depende de onde cai a
              quebra de linha, e o formatador move as quebras sozinho. Já saiu
              "5eventos" para o ecrã noutro sítio deste backoffice.
            */}
            <details className="border-t border-border pt-2.5 text-2xs text-muted-foreground">
              <summary className="cursor-pointer font-mono uppercase tracking-label hover:text-foreground">
                Como se calculam estes números
              </summary>
              <p className="mt-2 font-mono leading-relaxed">
                {[
                  /*
                   * `formatRate` e NÃO `formatPercent`: o segundo arredonda à
                   * percentagem inteira e escrevia "1 %" onde a taxa é 0,7 % — um número
                   * de contrato inflacionado em 43 %, impresso por baixo da tabela que a
                   * liga usa para conferir o que lhe é devido.
                   */
                  `Taxa Eupago estimada: ${formatEuro(EUPAGO_FIXED_FEE_CENTS)} + ${formatRate(EUPAGO_VARIABLE_RATE)} por transação MB WAY — o valor certo está no extrato Eupago.`,
                  `A taxa FirstRow (${commissionPct}%) sai no split de cada pagamento.`,
                  // Porque é que o bruto tem duas origens, e porque é que os preços
                  // não vêm do mesmo sítio. Quem confere o extrato ao cêntimo
                  // merece saber de onde saiu cada metade.
                  temBilhetes
                    ? "O bruto soma os acessos PPV (preço do evento) e os bilhetes de porta (preço copiado em cada bilhete, no momento da compra). Bilhetes por pagar e reembolsados não entram."
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            </details>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          className="mt-4"
          title="Sem movimentos"
          description="O extrato aparece com a primeira venda: bruto, taxa FirstRow, taxa Eupago estimada e líquido, mês a mês."
          action={
            <Link href="/admin/eventos" className={buttonVariants({ variant: "secondary" })}>
              Ver eventos
            </Link>
          }
        />
      )}
    </div>
  );
}
