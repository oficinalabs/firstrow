import { DataTable } from "@/components/admin/data-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  formatDate,
  formatDecimal,
  formatEuro,
  formatNumber,
  formatPercent,
  formatUsd,
} from "@/lib/format";
import {
  DELIVERY_USD_PER_1000_MINUTES,
  type MarginHealth,
  VIDEO_COST_CRITICAL_SHARE,
  VIDEO_COST_WARNING_SHARE,
} from "@/lib/video-costs";
import type { ChannelsInScope } from "@/server/channels";
import type { EventEconomicsRow, PlatformEconomics } from "@/server/stats";

/*
 * ============================================================================
 *  ECONOMIA POR EVENTO — receita e custo de entrega no mesmo ecrã
 * ============================================================================
 *
 * A comissão escala com PAGANTES, a entrega de vídeo escala com ESPECTADORES.
 * Enquanto o backoffice só mostrava o primeiro eixo, a fatura da Cloudflare era
 * uma surpresa mensal. Este bloco põe os dois lado a lado, por evento, para que
 * a pergunta "este evento valeu a pena?" tenha resposta antes da fatura.
 *
 * TUDO AQUI É ESTIMATIVA, e diz-se em cada sítio onde aparece um número. Os
 * minutos vêm do nosso heartbeat, não da analítica da Cloudflare (ver
 * `getDeliveryByEvent`), e o câmbio é uma referência revista à mão. Um evento
 * sem sessões medidas mostra "—" e não "0,00 €": zero parece um facto.
 */

const HEALTH_LABEL: Record<MarginHealth, string> = {
  normal: "Normal",
  atencao: "Atenção",
  critico: "Crítico",
};

/*
 * O estado NUNCA é só a cor. Cada nível tem uma palavra e, ao lado, a
 * percentagem que o justifica — quem não distingue o âmbar do vermelho lê
 * "Crítico · 62 %" e fica a saber exatamente o mesmo.
 */
const HEALTH_VARIANT: Record<MarginHealth, BadgeProps["variant"]> = {
  normal: "muted",
  atencao: "warning",
  critico: "destructive",
};

const HEALTH_HINT_TONE = {
  normal: "muted",
  atencao: "warning",
  critico: "destructive",
} as const;

/** Célula sem dados de visionamento. Ver a nota do rodapé da tabela. */
function SemDados() {
  return <span className="text-muted-foreground">—</span>;
}

function PesoNaComissao({ row }: { row: EventEconomicsRow }) {
  if (row.health === null) return <SemDados />;

  return (
    <span className="flex items-center justify-end gap-2">
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {row.costShare === null ? "—" : formatPercent(row.costShare)}
      </span>
      <Badge variant={HEALTH_VARIANT[row.health]}>{HEALTH_LABEL[row.health]}</Badge>
    </span>
  );
}

export function EventEconomics({
  economics,
  channels,
}: {
  economics: PlatformEconomics;
  channels: ChannelsInScope;
}) {
  const { commissionPct, usdToEur, rows, totals } = economics;

  if (rows.length === 0) return null;

  const capped = rows.reduce((n, row) => n + row.cappedSessions, 0);
  const comEstimativa = rows.length - totals.eventsWithoutDelivery;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Economia por evento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <div className="grid gap-3.5 md:grid-cols-3">
          <StatCard
            label={`Comissão FirstRow · ${commissionPct}%`}
            value={formatEuro(totals.commissionCents)}
            hint={`${formatNumber(rows.length)} eventos com movimento`}
          />
          <StatCard
            label="Custo de vídeo · est."
            value={formatEuro(totals.videoCostEurCents)}
            hint={`${formatUsd(totals.videoCostUsdCents)} · ${formatNumber(totals.minutes)} min entregues`}
          />
          <StatCard
            label="Margem · est."
            value={formatEuro(totals.marginCents)}
            hint={
              totals.costShare === null
                ? "sem comissão para comparar"
                : `o vídeo come ${formatPercent(totals.costShare)} da comissão`
            }
            hintTone={HEALTH_HINT_TONE[totals.health]}
          />
        </div>

        <DataTable<EventEconomicsRow>
          columns={[
            {
              header: "Evento",
              destaque: true,
              cell: (r) => (
                <span className="flex flex-col">
                  <span className="font-semibold">{r.title}</span>
                  <span className="font-mono text-2xs text-muted-foreground">
                    {formatDate(r.startsAt)}
                  </span>
                </span>
              ),
            },
            // De quem é este evento — só com mais do que um canal em jogo, a
            // mesma regra do resto do backoffice (ver `channelsInScope`).
            ...(channels.many
              ? [
                  {
                    header: "Canal",
                    cell: (r: EventEconomicsRow) => (
                      <span className="text-xs text-muted-foreground">
                        {channels.byId.get(r.channelId)?.name ?? "—"}
                      </span>
                    ),
                  },
                ]
              : []),
            { header: "Compradores", numeric: true, cell: (r) => formatNumber(r.buyers) },
            { header: "Receita", numeric: true, cell: (r) => formatEuro(r.revenueCents) },
            {
              header: `Comissão · ${commissionPct}%`,
              numeric: true,
              cell: (r) => formatEuro(r.commissionCents),
            },
            {
              header: "Minutos · est.",
              numeric: true,
              cell: (r) => (r.minutes === null ? <SemDados /> : formatNumber(r.minutes)),
            },
            {
              header: "Custo vídeo · est.",
              numeric: true,
              className: "text-destructive",
              cell: (r) =>
                r.videoCostEurCents === null || r.videoCostUsdCents === null ? (
                  <SemDados />
                ) : (
                  <span className="flex flex-col">
                    <span>{formatEuro(-r.videoCostEurCents)}</span>
                    {/* O que a Cloudflare cobra mesmo. O euro acima é derivado. */}
                    <span className="font-mono text-2xs text-muted-foreground">
                      {formatUsd(r.videoCostUsdCents)}
                    </span>
                  </span>
                ),
            },
            { header: "Peso na comissão", numeric: true, cell: (r) => <PesoNaComissao row={r} /> },
            {
              header: "Margem · est.",
              numeric: true,
              className: "font-semibold",
              // Margem negativa a vermelho — REFORÇO, nunca o único sinal: o
              // sinal "−" e o badge "Crítico" ao lado dizem-no sem depender de
              // se distinguir a cor.
              cell: (r) =>
                r.marginCents === null ? (
                  <SemDados />
                ) : (
                  <span className={r.marginCents < 0 ? "text-destructive" : undefined}>
                    {formatEuro(r.marginCents)}
                  </span>
                ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.eventId}
          footer={
            <TableRow className="border-t-2 border-border font-semibold hover:bg-transparent">
              <TableCell>Total</TableCell>
              {channels.many ? <TableCell /> : null}
              <TableCell numeric>{formatNumber(rows.reduce((n, r) => n + r.buyers, 0))}</TableCell>
              <TableCell numeric>{formatEuro(totals.revenueCents)}</TableCell>
              <TableCell numeric>{formatEuro(totals.commissionCents)}</TableCell>
              <TableCell numeric>{formatNumber(totals.minutes)}</TableCell>
              <TableCell numeric className="text-destructive">
                {formatEuro(-totals.videoCostEurCents)}
              </TableCell>
              <TableCell numeric>
                {totals.costShare === null ? "—" : formatPercent(totals.costShare)}
              </TableCell>
              <TableCell numeric>{formatEuro(totals.marginCents)}</TableCell>
            </TableRow>
          }
        />

        {/*
          As frases montam-se em JavaScript e entram inteiras. Parece mais
          pesado do que escrevê-las em JSX e é o contrário: o JSX come o espaço
          entre uma expressão e o texto que lhe segue conforme onde cai a quebra
          de linha, e o formatador move as quebras sozinho. Já aconteceu — saiu
          "5eventos" para o ecrã. Uma string não tem esse problema.
        */}
        <p className="border-t-2 border-accent pt-2.5 font-mono text-2xs leading-relaxed text-muted-foreground">
          {[
            `Custo de entrega estimado a ${DELIVERY_USD_PER_1000_MINUTES} $ por 1000 minutos (Cloudflare Stream), convertido a ${formatDecimal(usdToEur)} € por dólar — taxa de referência, revista à mão.`,
            "Os minutos vêm do heartbeat do nosso player, não da analítica da Cloudflare: é uma aproximação do que a rede dela entregou, e a fatura manda.",
            `"Peso na comissão" avisa a partir de ${formatPercent(VIDEO_COST_WARNING_SHARE)} e fica crítico a partir de ${formatPercent(VIDEO_COST_CRITICAL_SHARE)}.`,
            "O armazenamento do arquivo (pré-pago ao mês) não entra aqui — não é atribuível a um evento.",
          ].join(" ")}{" "}
          {totals.eventsWithoutDelivery > 0 ? (
            <>
              <strong className="font-semibold text-foreground">
                {`${formatNumber(totals.eventsWithoutDelivery)} de ${formatNumber(rows.length)} eventos ainda sem dados de visionamento ("—")`}
              </strong>
              {`: o custo desses não entra no total, por isso a margem acima é um limite superior — os ${formatNumber(comEstimativa)} restantes é que estão medidos.`}
            </>
          ) : null}{" "}
          {capped > 0
            ? `${formatNumber(capped)} sessões passaram o teto por sessão e foram truncadas.`
            : null}
        </p>
      </CardContent>
    </Card>
  );
}
