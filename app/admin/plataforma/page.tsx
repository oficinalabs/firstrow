import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChannelFilterTabs, SectionHeading } from "@/components/admin/charts/dashboard-chrome";
import {
  ConcurrencySection,
  HealthSection,
  MarginSection,
  RevenueSection,
  SalesByEventSection,
  SignupsSection,
} from "@/components/admin/charts/platform-sections";
import { TrendBadge } from "@/components/admin/charts/trend-badge";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodTabs } from "@/components/admin/period-tabs";
import { StatCard } from "@/components/ui/stat-card";
import { formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { type ChannelScope, isPlatformAdmin, manageScope, requireUser } from "@/server/authz";
import { channelsInScope } from "@/server/channels";
import { listPurchasesAtRisk } from "@/server/purchases";
import {
  getDashboardTrends,
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
 *  A ORGANIZAÇÃO É POR PERGUNTA, NÃO POR TABELA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Os blocos estão agrupados pela pergunta que quem lê está a fazer — "como vai
 * o negócio", "quanto sobra", "que evento correu melhor", "como cresce o
 * público", "onde está o risco" — e não pela tabela da base de dados de onde os
 * números vêm. É o que o dono pediu: primeiro a pergunta, depois os números que
 * a respondem. O mais importante em cima e maior (a receita e a sua variação);
 * o acumulado de sempre no fim, que é contexto e não o que mudou hoje.
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
  const fullScope = manageScope(user);

  // A lista de canais precisa do âmbito COMPLETO: é o que alimenta o filtro (que
  // tem de mostrar todos) e o que nomeia cada canal nas linhas. Vem primeiro
  // porque o filtro de canal se valida contra ela.
  const channels = await channelsInScope(fullScope);

  /*
   * O FILTRO DE CANAL — uma VISTA, não uma permissão.
   *
   * O id vem do URL e é validado contra a lista JÁ carregada, nunca aceite como
   * veio (a mesma regra do seletor de evento): um id que não seja de um canal
   * real cai em "todos", não abre outro âmbito. Estreitar o âmbito é seguro
   * porque o `platform_admin` já pode ver todos — isto só escolhe de qual falar.
   */
  const canalPedido = typeof params.canal === "string" ? params.canal : null;
  const canalSelecionado = canalPedido && channels.byId.has(canalPedido) ? canalPedido : null;
  const viewScope: ChannelScope = canalSelecionado
    ? { all: false, channelIds: [canalSelecionado] }
    : fullScope;

  // Com um canal escolhido, as secções deixam de repetir o nome dele em cada
  // linha (`many: false`) — mas o `byId` fica completo, para nomear com
  // segurança qualquer canal que apareça.
  const channelsForSections = {
    ...channels,
    many: canalSelecionado ? false : channels.many,
  };

  const [totals, revenue, sales, signups, health, economics, comSessoes, atRisk, trends] =
    await Promise.all([
      getPlatformTotals(),
      getRevenueByPeriod(viewScope, period),
      listSalesByEvent(viewScope, period),
      // Os registos são sempre da plataforma inteira — não levam âmbito.
      getSignupsByPeriod(period),
      getPlatformHealth(viewScope, period),
      getPlatformEconomics(viewScope, period),
      listEventsWithConcurrency(viewScope),
      listPurchasesAtRisk(viewScope),
      getDashboardTrends(viewScope, period),
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

  // Um só construtor de links, para nenhum controlo perder o que os outros
  // puseram no URL: o período preserva canal e evento, o canal preserva o
  // período, e por aí. `undefined` mantém o valor atual; `null` limpa-o.
  const linkFor = (over: {
    periodo?: PeriodKey;
    canal?: string | null;
    evento?: string | null;
  }) => {
    const query = new URLSearchParams();
    query.set("periodo", over.periodo ?? period);
    const canal = over.canal !== undefined ? over.canal : canalSelecionado;
    if (canal) query.set("canal", canal);
    const evento = over.evento !== undefined ? over.evento : (selecionado?.eventId ?? null);
    if (evento) query.set("evento", evento);
    return `/admin/plataforma?${query.toString()}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Plataforma"
        meta={`${formatNumber(channels.list.length)} canais · admin interno FirstRow`}
        action={
          <PeriodTabs current={period} hrefFor={(destino) => linkFor({ periodo: destino })} />
        }
      />

      {/* O filtro de canal só existe com mais do que um canal (ver o componente).
          Fica à vista, abaixo do cabeçalho — não atrás de um clique, como o dono
          pediu para os filtros que não escondem a informação principal. Trocar
          de canal larga o evento selecionado (é de outro canal). */}
      {channels.many ? (
        <ChannelFilterTabs
          channels={channels.list}
          current={canalSelecionado}
          hrefFor={(canal) => linkFor({ canal, evento: null })}
        />
      ) : null}

      {/* ── COMO VAI O NEGÓCIO ─────────────────────────────────────────────── */}
      <SectionHeading hint="Os números de topo, e como se mexeram face ao período anterior.">
        Como vai o negócio
      </SectionHeading>

      <div className="flex flex-col gap-2">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* A receita é o número mais importante — primeiro, e com a variação
              logo por baixo, não numa tabela à parte. */}
          <StatCard
            label={`Receita · ${PERIODS[period].label}`}
            value={formatEuro(brutoPeriodo)}
            hint={<TrendBadge trend={trends.revenueCents} />}
          />
          <StatCard
            label={`Espectadores · ${PERIODS[period].label}`}
            value={formatNumber(trends.viewers.current)}
            hint={<TrendBadge trend={trends.viewers} />}
          />
          <StatCard
            label={`Compradores · ${PERIODS[period].label}`}
            value={formatNumber(trends.buyers.current)}
            hint={<TrendBadge trend={trends.buyers} />}
          />
          <StatCard
            label={`Registos · ${PERIODS[period].label}`}
            value={formatNumber(trends.signups.current)}
            hint={<TrendBadge trend={trends.signups} />}
          />
        </div>

        {/* Uma legenda só para as quatro setas, em vez de repetir "vs período
            anterior" em cada cartão. Diz também o que o filtro de canal NÃO
            muda: os registos são sempre da plataforma inteira. */}
        <p className="font-mono text-2xs leading-relaxed text-muted-foreground">
          As setas comparam cada número com os {trends.previousLabel}.
          {canalSelecionado
            ? " Os registos ficam sempre da plataforma inteira — uma conta não nasce dentro de um canal."
            : ""}
        </p>
      </div>

      <RevenueSection revenue={revenue} channels={channelsForSections} />

      {/* ── QUANTO SOBRA ───────────────────────────────────────────────────── */}
      <SectionHeading hint="A comissão da FirstRow contra o que o vídeo custa a entregar.">
        Quanto sobra
      </SectionHeading>

      {/*
        Os três cartões da economia falam do MESMO intervalo que os de cima:
        `getPlatformEconomics` leva o período, como as outras queries. Uma
        comissão de 90 dias sobre um custo de vídeo de sempre não era rácio de
        coisa nenhuma. Sem variação aqui de propósito — a margem estimada
        depende de minutos entregues e o período anterior traria mais ruído do
        que sinal; a leitura que interessa é o rácio DENTRO do período.
      */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <StatCard
          label={`Comissão · ${revenue.commissionPct}%`}
          value={formatEuro(comissaoPeriodo)}
          hint="o que a FirstRow leva no período"
        />
        <StatCard
          label={`Custo de vídeo · est. · ${PERIODS[period].label}`}
          value={formatEuro(economics.totals.videoCostEurCents)}
          hint={`${formatNumber(economics.totals.minutes)} min entregues`}
        />
        <StatCard
          label={`Margem · est. · ${PERIODS[period].label}`}
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

      <MarginSection economics={economics} />

      {/* ── QUE EVENTO CORREU MELHOR ───────────────────────────────────────── */}
      <SectionHeading hint="Cada evento pelos dois canais de venda, e a curva do pico.">
        Que evento correu melhor
      </SectionHeading>

      <SalesByEventSection
        sales={sales.rows}
        channels={channelsForSections}
        commissionPct={sales.commissionPct}
      />

      <ConcurrencySection
        concurrency={concurrency}
        events={comSessoes}
        selectedId={selecionado?.eventId ?? null}
        period={period}
        channelParam={canalSelecionado}
      />

      {/* ── COMO CRESCE O PÚBLICO ──────────────────────────────────────────── */}
      <SectionHeading hint="De quem se registou em cada período, quantos chegaram a comprar.">
        Como cresce o público
      </SectionHeading>

      <SignupsSection signups={signups} />

      {/* ── ONDE ESTÁ O RISCO ──────────────────────────────────────────────── */}
      <SectionHeading hint="Dinheiro que ficou a meio, e sessões que a plataforma cortou.">
        Onde está o risco
      </SectionHeading>

      <HealthSection health={health} atRisk={atRisk} channels={channelsForSections} />

      {/* ── TOTAIS DE SEMPRE ───────────────────────────────────────────────── */}
      <SectionHeading hint="O acumulado desde o início, sem janela nem filtro de canal.">
        Totais de sempre
      </SectionHeading>

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
