"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec, ValueKind } from "@/components/admin/charts/series";
import { formatEuro, formatNumber } from "@/lib/format";

/*
 * ============================================================================
 *  O ÚNICO SÍTIO DO PROJETO QUE IMPORTA `recharts`
 * ============================================================================
 *
 * E é de propósito que seja um só: este módulo é o que o `chart-canvas` carrega
 * com `next/dynamic`, por isso a biblioteca inteira vive num pedaço à parte que
 * só desce na rota do admin. Um segundo ficheiro a importar `recharts`
 * directamente punha-a no bundle partilhado e o site público passava a pagar
 * uns 100 KB por gráficos que nunca mostra.
 *
 * SEM ANIMAÇÕES (`isAnimationActive={false}`). Não é austeridade por gosto: a
 * dashboard relê-se muitas vezes ao dia e uma barra que cresce meio segundo de
 * cada vez que se muda de período é meio segundo em que os números ainda não
 * são os números. Isto é uma ferramenta de trabalho.
 *
 * SEM `Legend` do recharts: a legenda é desenhada no `chart-card`, do lado do
 * servidor, em HTML normal. Assim ela existe no corpo da resposta — para o
 * leitor de ecrã e para quem tem o JS em baixo — em vez de aparecer só depois
 * de a biblioteca carregar.
 */

/** Grelha, eixos e etiquetas saem todos de tokens — zero hex neste ficheiro. */
const EIXO = "var(--color-muted-foreground)";
const GRELHA = "var(--color-border)";

/** 11px — o `--text-2xs` do sistema, que é o tamanho das labels mono. */
const TAMANHO_TICK = 11;

function formatValue(value: number, kind: ValueKind): string {
  return kind === "money" ? formatEuro(value) : formatNumber(value);
}

/**
 * Etiqueta do eixo Y — curta de propósito.
 *
 * A 375px o eixo Y não pode gastar mais do que uns 44px, e "1 234,00 €" não
 * cabe. Os cêntimos caem (quem quer o cêntimo lê a tabela ou passa o rato) e
 * fica o euro inteiro. O eixo serve para dar a ESCALA; o valor exato vive na
 * tabela, que é onde ele é auditável.
 */
function formatTick(value: number, kind: ValueKind): string {
  if (kind === "count") return formatNumber(value);
  return `${formatNumber(Math.round(value / 100))} €`;
}

type PontoAchatado = { x: string } & Record<string, number | string>;

/*
 * O contrato do `series.ts` guarda os valores num objeto aninhado (`values`) e
 * o recharts quer-nos achatados na raiz do ponto. O achatamento acontece aqui,
 * e as chaves levam o prefixo `v:` — sem ele, uma série cuja chave fosse "x"
 * apagava o rótulo do eixo, e as chaves das séries são ids de canal, que um dia
 * podem ser o que forem.
 */
const PREFIXO = "v:";

function achatar(spec: ChartSpec): PontoAchatado[] {
  return spec.points.map((ponto) => {
    const linha: PontoAchatado = { x: ponto.x };
    for (const serie of spec.series) {
      linha[PREFIXO + serie.key] = ponto.values[serie.key] ?? 0;
    }
    return linha;
  });
}

function DicaDeDados({
  active,
  payload,
  label,
  spec,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
  spec: ChartSpec;
}) {
  if (!active || !payload?.length) return null;

  const porChave = new Map(spec.series.map((s) => [PREFIXO + s.key, s]));
  const linhas = payload
    .map((entrada) => ({
      serie: porChave.get(String(entrada.dataKey)),
      valor: Number(entrada.value ?? 0),
    }))
    .filter((linha) => linha.serie !== undefined);

  // Só as séries com valor: numa dashboard com oito canais, listar sete zeros
  // para chegar ao único que vendeu torna a dica inútil.
  const comValor = linhas.filter((linha) => linha.valor !== 0);
  const mostrar = comValor.length > 0 ? comValor : linhas.slice(0, 1);
  const total = linhas.reduce((n, linha) => n + linha.valor, 0);

  return (
    <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-sm">
      <p className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {label}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {mostrar.map((linha) => (
          <li key={linha.serie?.key} className="flex items-center gap-2 text-2sm">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-xs"
              style={{ background: linha.serie?.color }}
            />
            <span className="text-muted-foreground">{linha.serie?.label}</span>
            <span className="ml-auto font-mono tabular-nums font-semibold">
              {formatValue(linha.valor, spec.valueKind)}
            </span>
          </li>
        ))}
      </ul>
      {/* O total só aparece quando há mais do que uma série a somar — com uma
          só, repetir o mesmo número por baixo era ruído. */}
      {mostrar.length > 1 && spec.kind === "stacked-bars" ? (
        <p className="mt-1.5 border-t border-border pt-1.5 text-right font-mono text-2sm font-semibold tabular-nums">
          {formatValue(total, spec.valueKind)}
        </p>
      ) : null}
    </div>
  );
}

export function ChartKit({ spec }: { spec: ChartSpec }) {
  const dados = achatar(spec);
  const altura = spec.height ?? 240;

  const eixos = (
    <>
      {/* Só linhas horizontais: as verticais competem com as barras e, num ecrã
          estreito, transformam o gráfico numa grelha de papel milimétrico. */}
      <CartesianGrid stroke={GRELHA} vertical={false} />
      <XAxis
        dataKey="x"
        stroke={EIXO}
        tick={{ fill: EIXO, fontSize: TAMANHO_TICK }}
        tickLine={false}
        axisLine={{ stroke: GRELHA }}
        // A 375px não cabem 14 rótulos: o recharts salta os que não cabem mas
        // mantém sempre o primeiro e o último, que são os que dão o período.
        interval="preserveStartEnd"
        minTickGap={16}
      />
      <YAxis
        stroke={EIXO}
        tick={{ fill: EIXO, fontSize: TAMANHO_TICK }}
        tickLine={false}
        axisLine={false}
        width={52}
        tickFormatter={(valor: number) => formatTick(valor, spec.valueKind)}
        allowDecimals={spec.valueKind === "count" ? false : undefined}
      />
      <Tooltip
        content={<DicaDeDados spec={spec} />}
        // O realce por baixo do cursor fica muito discreto: é para situar, não
        // para competir com as barras.
        cursor={{ fill: "var(--color-muted)", fillOpacity: 0.5 }}
      />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={altura}>
      {spec.kind === "line" ? (
        <LineChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          {eixos}
          {spec.series.map((serie) => (
            <Line
              key={serie.key}
              type="monotone"
              dataKey={PREFIXO + serie.key}
              name={serie.label}
              stroke={serie.color}
              strokeWidth={2}
              // Sem pontos desenhados: numa curva de 120 amostras eles colam-se
              // uns aos outros e a linha desaparece debaixo deles.
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      ) : (
        <BarChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          {eixos}
          {spec.series.map((serie) => (
            <Bar
              key={serie.key}
              dataKey={PREFIXO + serie.key}
              name={serie.label}
              fill={serie.color}
              // Um `stackId` comum empilha; sem ele, o recharts põe as barras
              // lado a lado. É a única diferença entre os dois tipos de barras.
              stackId={spec.kind === "stacked-bars" ? "total" : undefined}
              isAnimationActive={false}
              maxBarSize={48}
            />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
