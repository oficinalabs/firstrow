import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ConcurrencySection,
  HealthSection,
  MarginSection,
  RevenueSection,
  SalesByEventSection,
  SignupsSection,
} from "@/components/admin/charts/platform-sections";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodTabs } from "@/components/admin/period-tabs";
import { StatCard } from "@/components/ui/stat-card";
import { formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { isPlatformAdmin, manageScope, requireUser } from "@/server/authz";
import { channelsInScope } from "@/server/channels";
import { listPurchasesAtRisk } from "@/server/purchases";
import {
  getEventConcurrency,
  getPlatformEconomics,
  getPlatformHealth,
  getPlatformTotals,
  getRevenueByPeriod,
  getSignupsByPeriod,
  listEventsWithConcurrency,
  listSalesByEvent,
  PERIODS,
  type PeriodKey,
  resolvePeriod,
} from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Plataforma" };

/*
 * ============================================================================
 *  A VISTA GLOBAL DA FIRSTROW
 * ============================================================================
 *
 * É a única página do backoffice que mostra números SEM âmbito de canal: soma
 * a receita, os espectadores e os registos de TODAS as ligas. Por isso é a
 * única com gate a `platform_admin` em vez do papel do canal.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O GATE ESTÁ ANTES DO PRIMEIRO `await` DE DADOS, E ISSO É A SEGURANÇA TODA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Não é estilo: é a única coisa que funciona. No App Router o layout e a
 * página do mesmo segmento renderizam EM PARALELO, por isso um gate no
 * `app/admin/layout.tsx` decide DEPOIS de esta página já ter corrido as
 * queries e já as estar a escrever no payload em streaming. Medido pela
 * Frente H com uma conta sem poderes: `forbidden()`, `redirect()` e devolver
 * um `<Forbidden/>` no layout deixavam os números todos no corpo da resposta.
 *
 * E o `proxy.ts` também NÃO chega aqui: ele corta `/admin/**` com
 * `canEnterBackoffice`, que é "gere ALGUM canal?" — um `owner` de liga passa
 * por ele e chega a esta rota. Medido nesta frente, com sessão de dono de
 * canal: o proxy responde 200 e é este `notFound()` que fecha a porta.
 *
 * Ou seja: o corte real desta página é a linha abaixo. `notFound()` e não 403
 * — quem não é da FirstRow não precisa de saber que este ecrã existe. E como
 * está ANTES dos `await`, as queries globais nunca chegam a correr: não
 * buscar é a única forma de não revelar.
 */
export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser({ next: "/admin/plataforma" });
  if (!isPlatformAdmin(user)) notFound();

  const params = await searchParams;
  const period = resolvePeriod(params.periodo);
  /*
   * O âmbito vai às queries apesar de o gate acima garantir hoje `{ all: true }`.
   * Uma query global sem âmbito é uma fuga à espera de que alguém alargue o
   * gate — a mesma decisão já tomada em `/admin/ganhos`.
   */
  const scope = manageScope(user);

  const [totals, revenue, sales, signups, health, economics, channels, comSessoes, atRisk] =
    await Promise.all([
      getPlatformTotals(),
      getRevenueByPeriod(scope, period),
      listSalesByEvent(scope, period),
      getSignupsByPeriod(period),
      getPlatformHealth(scope, period),
      getPlatformEconomics(scope),
      channelsInScope(scope),
      listEventsWithConcurrency(scope),
      listPurchasesAtRisk(scope),
    ]);

  /*
   * O evento da curva vem do URL — e é validado contra a lista JÁ FILTRADA
   * pelo âmbito, nunca aceite como veio. `getEventConcurrency` não leva âmbito
   * (como `getEventSales`, quem a chama é que já decidiu de que evento se
   * fala), por isso é aqui que essa decisão tem de ser defensável: um id que
   * não esteja na lista do âmbito cai no evento mais recente, não abre outro.
   */
  const pedido = typeof params.evento === "string" ? params.evento : null;
  const selecionado = comSessoes.find((e) => e.eventId === pedido) ?? comSessoes[0] ?? null;
  const concurrency = selecionado ? await getEventConcurrency(selecionado.eventId) : null;

  const brutoPeriodo = revenue.totals.ppvCents + revenue.totals.ticketCents;
  const comissaoPeriodo = revenue.totals.ppvCommissionCents + revenue.totals.ticketCommissionCents;
  const conversao =
    signups.totals.signups > 0 ? signups.totals.converted / signups.totals.signups : null;

  // O link de cada período preserva o evento escolhido — trocar de período não
  // pode fazer perder a curva que se estava a ver.
  const hrefFor = (destino: PeriodKey) => {
    const query = new URLSearchParams({ periodo: destino });
    if (selecionado) query.set("evento", selecionado.eventId);
    return `/admin/plataforma?${query.toString()}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Plataforma"
        meta={`${formatNumber(channels.list.length)} canais · admin interno FirstRow`}
        action={<PeriodTabs current={period} hrefFor={hrefFor} />}
      />

      {/* Os quatro números do período. A margem é o que fica depois de o vídeo
          comer a sua parte da comissão — é a linha de fundo do negócio. */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Receita · ${PERIODS[period].label}`}
          value={formatEuro(brutoPeriodo)}
          hint={`${formatNumber(revenue.totals.ppvPurchases)} acessos · ${formatNumber(revenue.totals.ticketsSold)} bilhetes`}
          hintTone={brutoPeriodo > 0 ? "success" : "muted"}
        />
        <StatCard
          label={`Comissão · ${revenue.commissionPct}%`}
          value={formatEuro(comissaoPeriodo)}
          hint="o que a FirstRow leva no período"
        />
        <StatCard
          label="Custo de vídeo · est."
          value={formatEuro(economics.totals.videoCostEurCents)}
          hint={`${formatNumber(economics.totals.minutes)} min entregues · desde o início`}
        />
        <StatCard
          label="Margem · est."
          value={formatEuro(economics.totals.marginCents)}
          hint={
            economics.totals.costShare === null
              ? "sem comissão para comparar"
              : `o vídeo come ${formatPercent(economics.totals.costShare)} da comissão`
          }
          hintTone={
            economics.totals.health === "critico"
              ? "destructive"
              : economics.totals.health === "atencao"
                ? "warning"
                : "muted"
          }
        />
      </div>

      {/*
        O custo de vídeo e a margem acima são DESDE O INÍCIO, e não do período:
        `getPlatformEconomics` conta evento a evento sem janela temporal. Dizê-lo
        na pista do cartão é o mínimo — dois cartões lado a lado com períodos
        diferentes e sem aviso seriam uma comparação falsa.
      */}
      <RevenueSection revenue={revenue} channels={channels} />

      <SalesByEventSection
        sales={sales.rows}
        channels={channels}
        commissionPct={sales.commissionPct}
      />

      <MarginSection economics={economics} />

      <ConcurrencySection
        concurrency={concurrency}
        events={comSessoes}
        selectedId={selecionado?.eventId ?? null}
        period={period}
      />

      <SignupsSection signups={signups} />

      <HealthSection health={health} atRisk={atRisk} channels={channels} />

      {/* Os totais de sempre, que esta página já mostrava. Ficam no fim: quem
          abre a dashboard quer saber o que mudou, não o acumulado. */}
      <div className="grid gap-3.5 md:grid-cols-3">
        <StatCard
          label="Utilizadores"
          value={formatNumber(totals.users)}
          hint={
            conversao === null
              ? "contas criadas"
              : `${formatPercent(conversao)} das novas do período já compraram`
          }
        />
        <StatCard label="Eventos" value={formatNumber(totals.events)} hint="todos os estados" />
        <StatCard
          label="Receita total"
          value={formatEuro(totals.revenueCents)}
          hint="PPV desde o início"
        />
      </div>
    </div>
  );
}
