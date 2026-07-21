import Link from "next/link";
import { ChartCard } from "@/components/admin/charts/chart-card";
import {
  type ChartPoint,
  type ChartSeries,
  channelSeriesColor,
  TOKEN_SERIES,
} from "@/components/admin/charts/series";
import { DataTable } from "@/components/admin/data-table";
import { EventTitleLink } from "@/components/admin/event-title-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDate, formatEuro, formatNumber, formatPercent, formatTime } from "@/lib/format";
import type { ChannelsInScope } from "@/server/channels";
import type { PurchaseAtRisk } from "@/server/purchases";
import type {
  BucketUnit,
  EventConcurrency,
  EventSalesRow,
  EventWithSessions,
  PlatformEconomics,
  PlatformHealth,
  RevenueSeries,
  SignupSeries,
} from "@/server/stats";

/*
 * ============================================================================
 *  AS SECÇÕES DA DASHBOARD GLOBAL
 * ============================================================================
 *
 * Componentes de SERVIDOR: recebem os números já calculados por
 * `server/stats.ts` e só decidem como se leem. Nenhum vai à base de dados —
 * quem o faz é a página, uma vez, em paralelo.
 *
 * Estão juntos num ficheiro porque partilham os três ajudantes do topo
 * (rótulo de balde, nome de canal, título curto). Seis ficheiros a reimportar
 * os mesmos três era mais ficheiros e menos coesão, não mais arrumação.
 *
 * Cada secção responde a UMA pergunta, e a pergunta está escrita na descrição
 * do cartão — se uma secção não tiver pergunta, não tem razão para existir.
 */

// ── Ajudantes de rótulo ─────────────────────────────────────────────────────

/**
 * Chave de balde ("2026-07-06") → rótulo do eixo.
 *
 * Ao meio-dia UTC de propósito: a chave é uma data de parede sem hora, e
 * qualquer hora perto da meia-noite arrisca cair no dia anterior ao ser lida
 * noutro fuso. Ao meio-dia não há fuso do mundo que mude o dia.
 */
function bucketLabel(bucket: string, unit: BucketUnit): string {
  const at = new Date(`${bucket}T12:00:00Z`);
  if (unit === "week") return formatDate(at);
  const mes = new Intl.DateTimeFormat("pt-PT", { timeZone: "UTC", month: "short" })
    .format(at)
    .replace(/\./g, "");
  return `${mes} ${String(at.getUTCFullYear()).slice(2)}`;
}

const UNIT_LABEL: Record<BucketUnit, string> = { week: "por semana", month: "por mês" };

/**
 * Título curto para o eixo X.
 *
 * Um eixo com "Batalha de Apuramento — Zona Norte" escrito por baixo de cada
 * barra é ilegível a qualquer largura. Corta-se aqui, e a tabela por baixo
 * leva o título inteiro — que é a razão de a tabela não ser opcional.
 */
function shortTitle(title: string, limit = 16): string {
  const flat = title.trim();
  return [...flat].length <= limit ? flat : `${[...flat].slice(0, limit - 1).join("")}…`;
}

/** Quantos eventos cabem num gráfico antes de ele virar uma serra. */
const MAX_EVENTOS_NO_GRAFICO = 12;

// ── Receita por período, empilhada por canal ────────────────────────────────

export function RevenueSection({
  revenue,
  channels,
}: {
  revenue: RevenueSeries;
  channels: ChannelsInScope;
}) {
  const { unit, buckets, channelIds, rows, totals, commissionPct } = revenue;
  const nomeDe = (id: string) => channels.byId.get(id)?.name ?? "Canal removido";

  const series: ChartSeries[] = channelIds.map((id) => ({
    key: id,
    label: nomeDe(id),
    color: channelSeriesColor(channels.byId.get(id)),
  }));

  // Um balde por coluna; cada canal é uma fatia da pilha. Os baldes vêm da
  // série (já sem furos) e não das linhas — senão as semanas sem vendas
  // desapareciam do eixo e duas subidas separadas colavam-se numa só.
  const porBalde = new Map<string, ChartPoint>();
  for (const bucket of buckets) {
    porBalde.set(bucket, { x: bucketLabel(bucket, unit), values: {} });
  }
  for (const linha of rows) {
    const ponto = porBalde.get(linha.bucket);
    if (!ponto) continue;
    ponto.values[linha.channelId] =
      (ponto.values[linha.channelId] ?? 0) + linha.ppvCents + linha.ticketCents;
  }

  const linhasTabela = buckets.map((bucket) => {
    const doBalde = rows.filter((r) => r.bucket === bucket);
    return {
      bucket,
      label: bucketLabel(bucket, unit),
      ppvCents: doBalde.reduce((n, r) => n + r.ppvCents, 0),
      ticketCents: doBalde.reduce((n, r) => n + r.ticketCents, 0),
      commissionCents: doBalde.reduce(
        (n, r) => n + r.ppvCommissionCents + r.ticketCommissionCents,
        0,
      ),
    };
  });

  const bruto = totals.ppvCents + totals.ticketCents;

  return (
    <ChartCard
      title="Receita por canal"
      description="Quanto entrou em cada período, e de que liga veio."
      meta={UNIT_LABEL[unit]}
      hasData={rows.length > 0}
      empty={{
        title: "Ainda sem receita neste período",
        description:
          "A primeira venda abre o gráfico. Até lá não há nada medido — e um gráfico a zeros parecia uma medição.",
      }}
      spec={{ kind: "stacked-bars", series, points: [...porBalde.values()], valueKind: "money" }}
      table={
        <DataTable
          columns={[
            { header: unit === "week" ? "Semana" : "Mês", cell: (r) => r.label },
            { header: "PPV", numeric: true, cell: (r) => formatEuro(r.ppvCents) },
            { header: "Bilhetes", numeric: true, cell: (r) => formatEuro(r.ticketCents) },
            {
              header: "Total",
              numeric: true,
              className: "font-semibold",
              cell: (r) => formatEuro(r.ppvCents + r.ticketCents),
            },
            {
              header: `Comissão · ${commissionPct}%`,
              numeric: true,
              cell: (r) => formatEuro(r.commissionCents),
            },
          ]}
          rows={linhasTabela}
          rowKey={(r) => r.bucket}
          footer={
            <TableRow className="border-t-2 border-border font-semibold hover:bg-transparent">
              <TableCell>Total</TableCell>
              <TableCell numeric>{formatEuro(totals.ppvCents)}</TableCell>
              <TableCell numeric>{formatEuro(totals.ticketCents)}</TableCell>
              <TableCell numeric>{formatEuro(bruto)}</TableCell>
              <TableCell numeric>
                {formatEuro(totals.ppvCommissionCents + totals.ticketCommissionCents)}
              </TableCell>
            </TableRow>
          }
        />
      }
      footnote={[
        `PPV e bilhetes aparecem separados porque o extrato de Ganhos conta hoje só PPV: a coluna PPV desta tabela (${formatEuro(totals.ppvCents)}) é a que bate, ao cêntimo, com o bruto de lá.`,
        "Somá-los numa receita só dava dois ecrãs com números diferentes sobre o mesmo dinheiro.",
        "A comissão é arredondada por transação, como no split e no extrato.",
      ].join(" ")}
    />
  );
}

// ── Vendas por evento: PPV vs bilhetes ──────────────────────────────────────

export function SalesByEventSection({
  sales,
  channels,
  commissionPct,
}: {
  sales: EventSalesRow[];
  channels: ChannelsInScope;
  commissionPct: number;
}) {
  // Os mais recentes, e depois por ordem cronológica para o eixo se ler da
  // esquerda para a direita como o tempo.
  const noGrafico = [...sales]
    .slice(0, MAX_EVENTOS_NO_GRAFICO)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const series: ChartSeries[] = [
    { key: "ppv", label: "PPV", color: TOKEN_SERIES.ppv },
    { key: "bilhetes", label: "Bilhetes", color: TOKEN_SERIES.bilhetes },
  ];

  const points: ChartPoint[] = noGrafico.map((r) => ({
    x: shortTitle(r.title),
    values: { ppv: r.ppvCents, bilhetes: r.ticketCents },
  }));

  const totalComissao = sales.reduce((n, r) => n + r.commissionCents, 0);

  return (
    <ChartCard
      title="Vendas por evento"
      description="O que cada evento vendeu pelos dois canais de venda, e a comissão que gerou."
      meta={
        sales.length > MAX_EVENTOS_NO_GRAFICO
          ? `${MAX_EVENTOS_NO_GRAFICO} mais recentes`
          : undefined
      }
      hasData={sales.length > 0}
      empty={{
        title: "Nenhum evento vendeu neste período",
        description:
          "Assim que houver uma compra, o evento aparece aqui com PPV e bilhetes lado a lado.",
      }}
      spec={{ kind: "stacked-bars", series, points, valueKind: "money" }}
      table={
        <DataTable
          columns={[
            {
              header: "Evento",
              cell: (r) => (
                <span className="flex flex-col">
                  <EventTitleLink eventId={r.eventId} title={r.title} className="-my-2" />
                  <span className="font-mono text-2xs text-muted-foreground">
                    {formatDate(r.startsAt)}
                    {channels.many ? ` · ${channels.byId.get(r.channelId)?.name ?? "—"}` : ""}
                  </span>
                </span>
              ),
            },
            { header: "Acessos", numeric: true, cell: (r) => formatNumber(r.ppvBuyers) },
            { header: "PPV", numeric: true, cell: (r) => formatEuro(r.ppvCents) },
            { header: "Bilhetes", numeric: true, cell: (r) => formatNumber(r.ticketsSold) },
            { header: "Receita bilhetes", numeric: true, cell: (r) => formatEuro(r.ticketCents) },
            {
              header: `Comissão · ${commissionPct}%`,
              numeric: true,
              className: "font-semibold",
              cell: (r) => formatEuro(r.commissionCents),
            },
          ]}
          rows={sales}
          rowKey={(r) => r.eventId}
          footer={
            <TableRow className="border-t-2 border-border font-semibold hover:bg-transparent">
              <TableCell>Total</TableCell>
              <TableCell numeric>
                {formatNumber(sales.reduce((n, r) => n + r.ppvBuyers, 0))}
              </TableCell>
              <TableCell numeric>{formatEuro(sales.reduce((n, r) => n + r.ppvCents, 0))}</TableCell>
              <TableCell numeric>
                {formatNumber(sales.reduce((n, r) => n + r.ticketsSold, 0))}
              </TableCell>
              <TableCell numeric>
                {formatEuro(sales.reduce((n, r) => n + r.ticketCents, 0))}
              </TableCell>
              <TableCell numeric>{formatEuro(totalComissao)}</TableCell>
            </TableRow>
          }
        />
      }
      footnote={
        sales.length > MAX_EVENTOS_NO_GRAFICO
          ? `O gráfico mostra os ${MAX_EVENTOS_NO_GRAFICO} eventos mais recentes — a tabela mostra os ${formatNumber(sales.length)} do período.`
          : undefined
      }
    />
  );
}

// ── Comissão vs custo de vídeo: o rácio que decide o negócio ────────────────

export function MarginSection({ economics }: { economics: PlatformEconomics }) {
  const { rows, totals, commissionPct, usdToEur, periodLabel } = economics;

  // Só os eventos COM estimativa de entrega entram no gráfico: um evento sem
  // sessões medidas tem custo desconhecido, e desenhá-lo com uma barra de custo
  // a zero afirmava que não custou nada. Na tabela aparece com "—".
  const medidos = rows.filter((r) => r.videoCostEurCents !== null);
  const noGrafico = [...medidos]
    .slice(0, MAX_EVENTOS_NO_GRAFICO)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const series: ChartSeries[] = [
    { key: "comissao", label: "Comissão", color: TOKEN_SERIES.comissao },
    { key: "custo", label: "Custo de vídeo · est.", color: TOKEN_SERIES.custo },
  ];

  const points: ChartPoint[] = noGrafico.map((r) => ({
    x: shortTitle(r.title),
    values: { comissao: r.commissionCents, custo: r.videoCostEurCents ?? 0 },
  }));

  return (
    <ChartCard
      title="Comissão vs custo de vídeo"
      description="A comissão cresce com quem paga; a entrega cresce com quem vê. Este é o rácio que decide o negócio."
      // A janela entra na meta porque este bloco já não é "desde sempre": segue
      // o seletor da página, como tudo o resto. Sem o dizer, dois períodos
      // diferentes desenhavam o mesmo gráfico sem nada a distingui-los.
      meta={`${periodLabel ?? "desde o início"} · ${commissionPct}% · câmbio ${usdToEur} $/€`}
      hasData={medidos.length > 0}
      empty={{
        title: "Ainda sem visionamento medido",
        description:
          "O custo de entrega estima-se a partir das sessões do player. Sem uma única sessão não há custo para comparar com a comissão — e zero não é a resposta certa.",
      }}
      spec={{ kind: "grouped-bars", series, points, valueKind: "money" }}
      table={
        <DataTable
          columns={[
            {
              header: "Evento",
              cell: (r) => (
                <span className="flex flex-col">
                  <EventTitleLink eventId={r.eventId} title={r.title} className="-my-2" />
                  <span className="font-mono text-2xs text-muted-foreground">
                    {formatDate(r.startsAt)}
                  </span>
                </span>
              ),
            },
            { header: "Comissão", numeric: true, cell: (r) => formatEuro(r.commissionCents) },
            {
              header: "Custo vídeo · est.",
              numeric: true,
              className: "text-destructive",
              cell: (r) =>
                r.videoCostEurCents === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  formatEuro(-r.videoCostEurCents)
                ),
            },
            {
              header: "Peso na comissão",
              numeric: true,
              // O peso NUNCA é só a cor da barra: sai em número, aqui.
              cell: (r) =>
                r.costShare === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  formatPercent(r.costShare)
                ),
            },
            {
              header: "Margem · est.",
              numeric: true,
              className: "font-semibold",
              cell: (r) =>
                r.marginCents === null ? (
                  <span className="text-muted-foreground">—</span>
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
              <TableCell numeric>{formatEuro(totals.commissionCents)}</TableCell>
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
      }
      footnote={[
        "Os minutos vêm do heartbeat do nosso player, não da analítica da Cloudflare — a fatura manda.",
        totals.eventsWithoutDelivery > 0
          ? `${formatNumber(totals.eventsWithoutDelivery)} eventos ainda sem visionamento medido ficam de fora do gráfico e aparecem com "—" na tabela: o custo deles não é zero, é desconhecido, por isso a margem total acima é um limite superior.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

// ── Espectadores em simultâneo ──────────────────────────────────────────────

export function ConcurrencySection({
  concurrency,
  events,
  selectedId,
  period,
}: {
  concurrency: EventConcurrency | null;
  events: EventWithSessions[];
  selectedId: string | null;
  period: string;
}) {
  const selecionado = events.find((e) => e.eventId === selectedId) ?? null;
  const series: ChartSeries[] = [
    { key: "espectadores", label: "Espectadores", color: TOKEN_SERIES.espectadores },
  ];

  const points: ChartPoint[] = (concurrency?.points ?? []).map((p) => ({
    x: formatTime(p.at),
    values: { espectadores: p.viewers },
  }));

  const passo =
    concurrency && concurrency.stepSeconds >= 60
      ? `${concurrency.stepSeconds / 60} min`
      : `${concurrency?.stepSeconds ?? 0} s`;

  return (
    <ChartCard
      title="Espectadores em simultâneo"
      description="A curva do pico de um evento — quantas pessoas estavam a ver ao mesmo tempo."
      meta={
        concurrency && concurrency.peak > 0 ? `pico ${formatNumber(concurrency.peak)}` : undefined
      }
      hasData={points.length > 0}
      empty={{
        title: "Sem sessões de visionamento",
        description:
          "A curva desenha-se a partir das sessões do player. Nenhum evento no âmbito tem sessões registadas ainda.",
      }}
      spec={{ kind: "line", series, points, valueKind: "count", height: 220 }}
      table={
        <>
          {/*
            Escolher o evento é um FORMULÁRIO GET normal, com botão de submeter:
            funciona sem JavaScript, o resultado fica no URL e o "voltar" do
            browser faz o esperado. O período viaja escondido para não se perder
            ao trocar de evento.
          */}
          <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="periodo" value={period} />
            <label className="flex flex-col gap-1">
              <span className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
                Evento
              </span>
              <select
                name="evento"
                defaultValue={selectedId ?? ""}
                className="min-h-11 rounded-sm border border-input bg-field px-2.5 text-2sm"
              >
                {events.map((e) => (
                  <option key={e.eventId} value={e.eventId}>
                    {`${formatDate(e.startsAt)} · ${e.title}`}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              Ver curva
            </button>
          </form>

          <DataTable
            columns={[
              { header: "Hora", cell: (p) => formatTime(p.at) },
              { header: "Espectadores", numeric: true, cell: (p) => formatNumber(p.viewers) },
            ]}
            rows={concurrency?.points ?? []}
            rowKey={(p) => p.at.toISOString()}
          />
        </>
      }
      footnote={
        concurrency && selecionado
          ? [
              `${selecionado.title}: ${formatNumber(concurrency.sessions)} sessões, pico de ${formatNumber(concurrency.peak)} espectadores em simultâneo.`,
              `A curva é amostrada de ${passo} em ${passo} — um pico mais curto do que isso pode passar entre duas amostras.`,
              "O pico indicado é o máximo da própria curva, por isso o número e a linha nunca se desmentem.",
            ].join(" ")
          : undefined
      }
    />
  );
}

// ── Registos novos e conversão por coorte ───────────────────────────────────

export function SignupsSection({ signups }: { signups: SignupSeries }) {
  const { unit, buckets, rows, totals } = signups;

  const series: ChartSeries[] = [
    { key: "convertidos", label: "Já compraram", color: TOKEN_SERIES.convertidos },
    { key: "restantes", label: "Ainda não compraram", color: TOKEN_SERIES.registos },
  ];

  const porBalde = new Map(rows.map((r) => [r.bucket, r]));
  const points: ChartPoint[] = buckets.map((bucket) => {
    const linha = porBalde.get(bucket);
    return {
      x: bucketLabel(bucket, unit),
      values: {
        convertidos: linha?.converted ?? 0,
        // A pilha é registos = convertidos + restantes. Guardar o resto e não o
        // total é o que faz as duas fatias somarem o número de registos em vez
        // de o duplicarem.
        restantes: Math.max(0, (linha?.signups ?? 0) - (linha?.converted ?? 0)),
      },
    };
  });

  const linhasTabela = buckets.map((bucket) => {
    const linha = porBalde.get(bucket);
    const signupsDoBalde = linha?.signups ?? 0;
    const converted = linha?.converted ?? 0;
    return {
      bucket,
      label: bucketLabel(bucket, unit),
      signups: signupsDoBalde,
      converted,
      // Sem registos não há taxa nenhuma: `null` e não zero, porque 0 % afirma
      // que ninguém converteu de um universo que não existiu.
      taxa: signupsDoBalde > 0 ? converted / signupsDoBalde : null,
    };
  });

  const taxaGlobal = totals.signups > 0 ? totals.converted / totals.signups : null;

  return (
    <ChartCard
      title="Registos novos e conversão"
      description="De quem se registou em cada período, quantos chegaram a comprar."
      meta={taxaGlobal === null ? undefined : `${formatPercent(taxaGlobal)} no período`}
      hasData={totals.signups > 0}
      empty={{
        title: "Sem registos novos neste período",
        description:
          "Cada conta criada aparece no período em que nasceu, e muda de fatia quando compra.",
      }}
      spec={{ kind: "stacked-bars", series, points, valueKind: "count" }}
      table={
        <DataTable
          columns={[
            { header: unit === "week" ? "Semana" : "Mês", cell: (r) => r.label },
            { header: "Registos", numeric: true, cell: (r) => formatNumber(r.signups) },
            { header: "Compraram", numeric: true, cell: (r) => formatNumber(r.converted) },
            {
              header: "Conversão",
              numeric: true,
              className: "font-semibold",
              cell: (r) =>
                r.taxa === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  formatPercent(r.taxa)
                ),
            },
          ]}
          rows={linhasTabela}
          rowKey={(r) => r.bucket}
          footer={
            <TableRow className="border-t-2 border-border font-semibold hover:bg-transparent">
              <TableCell>Total</TableCell>
              <TableCell numeric>{formatNumber(totals.signups)}</TableCell>
              <TableCell numeric>{formatNumber(totals.converted)}</TableCell>
              <TableCell numeric>{taxaGlobal === null ? "—" : formatPercent(taxaGlobal)}</TableCell>
            </TableRow>
          }
        />
      }
      footnote={[
        "Conversão POR COORTE: cada conta conta no período em que se registou, e «comprou» vale para sempre — não é «compras do mês a dividir por registos do mês», que mistura gente e chega a passar dos 100 %.",
        "Por isso os períodos mais recentes aparecem naturalmente mais baixos: ainda não tiveram tempo de converter.",
        "O registo não pertence a canal nenhum — este número é sempre da plataforma inteira.",
      ].join(" ")}
    />
  );
}

// ── Saúde ───────────────────────────────────────────────────────────────────

const RISCO_LABEL: Record<PurchaseAtRisk["risco"], string> = {
  aberta: "A decorrer",
  expirada: "Expirada",
  "sem-cobranca": "Sem cobrança",
};

const RISCO_VARIANT: Record<PurchaseAtRisk["risco"], "muted" | "warning" | "destructive"> = {
  aberta: "muted",
  expirada: "destructive",
  "sem-cobranca": "warning",
};

/** O motivo do corte, em português e com o que ele quer dizer. */
const MOTIVO: Record<string, { label: string; hint: string }> = {
  other_device: { label: "Outro dispositivo", hint: "partilha de conta suspeita" },
  watermark: { label: "Marca de água", hint: "tentativa de adulteração" },
  no_access: { label: "Sem acesso", hint: "o acesso deixou de ser válido" },
  desconhecido: { label: "Sem motivo", hint: "sessão anterior ao registo de motivos" },
};

export function HealthSection({
  health,
  atRisk,
  channels,
}: {
  health: PlatformHealth;
  atRisk: PurchaseAtRisk[];
  channels: ChannelsInScope;
}) {
  const expiradas = atRisk.filter((p) => p.risco === "expirada");
  const emRisco = expiradas.reduce((n, p) => n + p.amountCents, 0);
  const partilha = health.blocked.find((b) => b.reason === "other_device")?.total ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saúde</CardTitle>
        <p className="text-2sm leading-relaxed text-muted-foreground">
          Dinheiro que ficou a meio, e sessões que a plataforma cortou.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <div className="grid gap-3.5 md:grid-cols-3">
          <StatCard
            label="Pagamentos por fechar"
            value={formatNumber(atRisk.length)}
            hint={
              expiradas.length > 0
                ? `${formatNumber(expiradas.length)} expirados · ${formatEuro(emRisco)} em risco`
                : "nenhum expirado"
            }
            hintTone={expiradas.length > 0 ? "destructive" : "muted"}
          />
          <StatCard
            label="Partilha suspeita"
            value={formatNumber(partilha)}
            hint="sessões cortadas por outro dispositivo"
            hintTone={partilha > 0 ? "warning" : "muted"}
          />
          <StatCard
            label="Reconexões silenciosas"
            value={formatNumber(health.superseded)}
            hint="mesmo dispositivo — não são bloqueios"
          />
        </div>

        {/*
          A nota que impede a métrica de voltar a mentir. Sem ela, o próximo a
          ler este ecrã soma os dois números — que foi exactamente o bug que a
          Frente N corrigiu.
        */}
        <p className="font-mono text-2xs leading-relaxed text-muted-foreground">
          Uma reconexão do mesmo dispositivo substitui a sessão em silêncio e NÃO conta como
          bloqueio; só um dispositivo diferente conta. Os dois números acima medem coisas diferentes
          e não se somam.
        </p>

        {health.blocked.length > 0 ? (
          <DataTable
            columns={[
              {
                header: "Motivo do corte",
                cell: (b) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">{MOTIVO[b.reason]?.label ?? b.reason}</span>
                    <span className="text-2xs text-muted-foreground">
                      {MOTIVO[b.reason]?.hint ?? "motivo não reconhecido"}
                    </span>
                  </span>
                ),
              },
              { header: "Sessões", numeric: true, cell: (b) => formatNumber(b.total) },
            ]}
            rows={health.blocked}
            rowKey={(b) => b.reason}
          />
        ) : (
          <p className="text-2sm text-muted-foreground">Nenhuma sessão cortada no período.</p>
        )}

        {atRisk.length > 0 ? (
          <div className="overflow-x-auto">
            <DataTable
              columns={[
                {
                  header: "Estado",
                  // Estado com PALAVRA, não só com cor do badge.
                  cell: (p) => (
                    <Badge variant={RISCO_VARIANT[p.risco]}>{RISCO_LABEL[p.risco]}</Badge>
                  ),
                },
                {
                  header: "Compra",
                  cell: (p) => (
                    <span className="flex flex-col">
                      <span className="font-semibold">{p.eventTitle}</span>
                      <span className="font-mono text-2xs text-muted-foreground">
                        {p.kind === "ticket" ? "bilhete" : "acesso PPV"}
                        {channels.many ? ` · ${channels.byId.get(p.channelId)?.name ?? "—"}` : ""}
                      </span>
                    </span>
                  ),
                },
                { header: "Comprador", cell: (p) => p.buyerName },
                {
                  header: "Referência",
                  cell: (p) => (
                    <span className="font-mono text-2xs text-muted-foreground">
                      {p.providerRef ?? "—"}
                    </span>
                  ),
                },
                { header: "Valor", numeric: true, cell: (p) => formatEuro(p.amountCents) },
              ]}
              rows={atRisk}
              rowKey={(p) => `${p.kind}·${p.id}`}
            />
          </div>
        ) : (
          <EmptyState
            title="Nenhum pagamento por fechar"
            description="Todas as compras com cobrança pedida foram fechadas. A reconciliação corre de 5 em 5 minutos."
            action={
              <Link href="/admin/ganhos" className={buttonVariants({ variant: "secondary" })}>
                Ver ganhos
              </Link>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
