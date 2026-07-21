import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { type DeleteBlock, DeleteEventDialog } from "@/components/admin/delete-event-dialog";
import { EventStatusBadge } from "@/components/admin/event-status-badge";
import { EventTitleLink } from "@/components/admin/event-title-link";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SCANNER_PATH } from "@/lib/backoffice-zones";
import { eventHubPath } from "@/lib/event-rules";
import { formatDate, formatEuro, formatNumber, formatTime } from "@/lib/format";
import {
  type AuthUser,
  canManageAnyChannel,
  canManageEvents,
  operateScope,
  requireBackofficePage,
} from "@/server/authz";
import { type ChannelsInScope, channelsInScope } from "@/server/channels";
import { countSalesByEvent } from "@/server/events";
import {
  type EventForOperations,
  type EventWithSales,
  listEventsForOperations,
  listEventsWithSales,
} from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Eventos" };

/** "hoje 21:30" ou "24/07 21:30" — a mesma frase nas duas listas. */
function eventWhen(startsAt: Date): string {
  const day = formatDate(startsAt);
  return `${day === formatDate(new Date()) ? "hoje" : day} ${formatTime(startsAt)}`;
}

/**
 * Parte os eventos em "a seguir" e "já passaram", com o que está para vir
 * primeiro. Um live em curso ganha sempre a cabeça da lista, esteja a que horas
 * estiver. É a MESMA regra para as duas listas — por isso vive aqui uma vez só.
 */
function splitEvents<T extends { status: string; startsAt: Date }>(
  events: readonly T[],
): { upcoming: T[]; past: T[] } {
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.status === "live" || e.startsAt.getTime() >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = events.filter((e) => e.status !== "live" && e.startsAt.getTime() < now);
  return { upcoming, past };
}

/** Molde das duas listas: cabeçalho com contagem e a tabela lá dentro. */
function EventsSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>{title}</CardTitle>
        <span className="font-mono text-2xs text-muted-foreground">{formatNumber(count)}</span>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/*
 * ============================================================================
 *  A PÁGINA DE EVENTOS — UMA ROTA, DUAS QUERIES, ESCOLHIDAS PELO PAPEL
 * ============================================================================
 *
 * O dono quis um só item de menu e um só URL: "ter duas abas 'Eventos' e
 * 'agenda' é confuso e parece informação duplicada". Fundiu-se a NAVEGAÇÃO —
 * não a segurança.
 *
 * PORQUE É QUE ERAM DUAS, E O QUE NÃO SE PODE PERDER AO FUNDIR
 * No App Router, o que uma página FOI BUSCAR entra no payload do RSC mesmo que o
 * componente que o mostrava não chegue a ser desenhado. Uma `/admin/eventos`
 * única que trouxesse receita por linha e apenas escondesse colunas ao `staff`
 * punha esses números no corpo da resposta enviada a quem valida bilhetes à
 * porta — é a MESMA fuga que já apareceu (e foi fechada) nas páginas de
 * transmissão e de bilhetes. Esconder a coluna não esconde o dado.
 *
 * A SOLUÇÃO: decidir pelo papel, ANTES do await de dados, QUE query correr —
 * nunca as duas:
 *
 *   · gere algum canal (`owner`/`admin`) → `listEventsWithSales`, com PPV,
 *     compradores e receita por linha, e as colunas que os mostram;
 *   · só opera (`staff`)                 → `listEventsForOperations`, que nem vai
 *     buscar dinheiro à base de dados — escolhe as colunas à mão no Postgres.
 *
 * A UI mostra as colunas que RECEBEU, e nunca esconde colunas que recebeu: se
 * recebesse a versão completa e as tapasse por CSS, reabria a fuga. Não buscar é
 * a única forma de não revelar.
 *
 * (O gate da ROTA é `operate` — o staff entra. Quem decide QUE dados vê é esta
 * bifurcação, não o gate. Ver `lib/backoffice-zones.ts`.)
 */
export default async function AdminEventsPage() {
  // Gate próprio e antes de qualquer query — a primeira linha, sempre. No App
  // Router a página começa a ler antes de um gate de layout a poder travar.
  const user = await requireBackofficePage("/admin/eventos");
  // `operateScope` nos dois ramos: um dono que também seja staff noutro canal
  // tem de ver as duas listas. O gate diz QUEM abre; o âmbito diz DE QUE canais
  // fala; a bifurcação abaixo diz QUE dados se buscam. São três perguntas.
  const scope = operateScope(user);

  // A BIFURCAÇÃO. Escolhe-se UMA query — o ramo que não corre não escreve nada
  // no payload, e é isso que impede a receita de viajar para quem só opera.
  if (!canManageAnyChannel(user)) {
    const [events, channels] = await Promise.all([
      listEventsForOperations(scope),
      // O MESMO âmbito: a lista de canais que dá nome às linhas não pode ser
      // mais larga do que a lista de eventos que se mostra.
      channelsInScope(scope),
    ]);
    return <OperationsList events={events} channels={channels} />;
  }

  const [events, sales, channels] = await Promise.all([
    listEventsWithSales(scope),
    countSalesByEvent(scope),
    channelsInScope(scope),
  ]);
  return <ManagementList user={user} events={events} sales={sales} channels={channels} />;
}

/*
 * ────────────────────────────────────────────────────────────────────────────
 *  A LISTA DE GESTÃO — com PPV, compradores e receita (quem gere um canal)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * É presentacional (não `async`): recebe os dados já buscados. A decisão de os
 * buscar — e de os buscar COM dinheiro — foi tomada acima, pelo papel.
 */

/** Porque é que este evento não se apaga (se for o caso) — a mesma regra do servidor. */
function deleteBlock(event: EventWithSales, sales: number): DeleteBlock | undefined {
  if (event.status === "live") return { reason: "live" };
  if (sales > 0) return { reason: "sales", sales };
  return undefined;
}

/*
 * `canManage` é uma FUNÇÃO e não um booleano porque a resposta é por linha: quem
 * opera dois canais pode ser dono de um e só equipa no outro, e o botão de
 * apagar tem de seguir o canal do evento, não o papel da pessoa.
 */
function ManagementTable({
  rows,
  sales,
  canManage,
  channels,
}: {
  rows: EventWithSales[];
  sales: Map<string, number>;
  canManage: (event: EventWithSales) => boolean;
  channels: ChannelsInScope;
}) {
  return (
    <DataTable<EventWithSales>
      columns={[
        { header: "Estado", cell: (e) => <EventStatusBadge status={e.status} /> },
        {
          header: "Evento",
          // Em cartão é o título: sem ele, o cartão era um estado, uma data e
          // três números sem dizer de que evento se trata.
          destaque: true,
          // O nome abre o evento. O "Abrir" no fim da linha continua lá — é o
          // que diz que a linha tem para onde ir a quem não experimenta clicar
          // no texto —, mas deixou de ser o único caminho.
          cell: (e) => (
            <EventTitleLink
              eventId={e.id}
              title={e.title}
              muted={e.status === "ended"}
              // Ver a nota do alvo de toque em `EventTitleLink`: isto devolve à
              // célula o `py-2` que ela já tem, e a linha fica nos 44px.
              className="-my-2"
            />
          ),
        },
        /*
         * De quem é este evento. A coluna só existe quando há mais do que um
         * canal em jogo: com uma liga só era a mesma palavra em todas as
         * linhas, a roubar espaço à data e à receita.
         *
         * Com duas, é o contrário — sem ela, "Final da Época" de uma liga e o
         * da outra são a mesma linha, e o botão de apagar está mesmo ao lado.
         */
        ...(channels.many
          ? [
              {
                header: "Canal",
                cell: (e: EventWithSales) => (
                  <span className="text-xs text-muted-foreground">
                    {channels.byId.get(e.channelId)?.name ?? "—"}
                  </span>
                ),
              },
            ]
          : []),
        {
          header: "Data",
          cell: (e) => (
            <span className="font-mono text-xs text-muted-foreground">{eventWhen(e.startsAt)}</span>
          ),
        },
        { header: "PPV", numeric: true, cell: (e) => formatEuro(e.priceCents) },
        { header: "Compradores", numeric: true, cell: (e) => formatNumber(e.buyers) },
        { header: "Receita", numeric: true, cell: (e) => formatEuro(e.revenueCents) },
        {
          header: "",
          numeric: true,
          // Em cartão estes três são o rodapé, com espaço entre eles. Sem isto
          // ficavam encostados à direita, com 16px de altura e 3px de intervalo
          // — três alvos de dedo à distância de um erro uns dos outros.
          accoes: true,
          cell: (e) => (
            <span className="flex items-center justify-end gap-3.5">
              <Link
                href={eventHubPath(e.id)}
                className="alvo-toque font-sans text-xs font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {e.status === "ended" ? "Ver" : "Abrir"}
              </Link>
              {/* Editar é gerir (mexe no preço e na configuração), por isso segue
                  o mesmo `canManage` do botão de apagar — o canal do evento, não
                  o papel da pessoa. */}
              {canManage(e) ? (
                <>
                  <Link
                    href={`/admin/eventos/${e.id}/editar`}
                    className="alvo-toque font-sans text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Editar
                  </Link>
                  <DeleteEventDialog
                    eventId={e.id}
                    title={e.title}
                    blocked={deleteBlock(e, sales.get(e.id) ?? 0)}
                  />
                </>
              ) : null}
            </span>
          ),
        },
      ]}
      rows={rows}
      rowKey={(e) => e.id}
    />
  );
}

function ManagementList({
  user,
  events,
  sales,
  channels,
}: {
  user: AuthUser;
  events: EventWithSales[];
  sales: Map<string, number>;
  channels: ChannelsInScope;
}) {
  const { upcoming, past } = splitEvents(events);
  const canManage = (event: EventWithSales) => canManageEvents(user, event.channelId);
  // Estamos neste ramo porque a pessoa gere algum canal, logo pode criar — em
  // qual é que o evento nasce decide-se em `resolveChannelForNewEvent`.
  const createButton = (
    <Link href="/admin/eventos/novo" className={buttonVariants()}>
      Criar evento
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Eventos" action={createButton} />

      {events.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="Cria o primeiro evento"
          description="A lista de eventos, os compradores e a receita de cada um vivem aqui."
          action={
            <Link href="/admin/eventos/novo" className={buttonVariants({ size: "lg" })}>
              Criar evento
            </Link>
          }
        />
      ) : null}

      {/* TODO(frente-d): coluna BILHETES (vendidos/lotação) — server/stats.ts
          ainda não junta a tabela tickets à lista de eventos. */}
      {upcoming.length > 0 ? (
        <EventsSection title="A seguir" count={upcoming.length}>
          <ManagementTable
            rows={upcoming}
            sales={sales}
            canManage={canManage}
            channels={channels}
          />
        </EventsSection>
      ) : null}

      {past.length > 0 ? (
        <EventsSection title="Já passaram" count={past.length}>
          <ManagementTable rows={past} sales={sales} canManage={canManage} channels={channels} />
        </EventsSection>
      ) : null}
    </div>
  );
}

/*
 * ────────────────────────────────────────────────────────────────────────────
 *  A LISTA DE OPERAÇÃO — o que há para operar, SEM um número de dinheiro
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Para quem só opera (o `staff`), que valida bilhetes à porta e opera a régie.
 * Fica de fora, dito por extenso: preço PPV, preço de bilhete, compradores,
 * receita, lotação e nomes ou emails de quem comprou — nada disso é sequer
 * buscado (ver `listEventsForOperations`). Fica o que serve para operar: o quê,
 * quando, em que estado, e para onde ir.
 */
function OperationsTable({
  rows,
  channels,
}: {
  rows: EventForOperations[];
  channels: ChannelsInScope;
}) {
  return (
    <DataTable<EventForOperations>
      columns={[
        { header: "Estado", cell: (e) => <EventStatusBadge status={e.status} /> },
        {
          header: "Evento",
          destaque: true,
          cell: (e) => (
            <EventTitleLink
              eventId={e.id}
              title={e.title}
              muted={e.status === "ended"}
              className="-my-2"
            />
          ),
        },
        // De quem é este evento. Só com mais do que um canal em jogo — quem é
        // staff de duas ligas precisa de distinguir dois "Final da Época".
        ...(channels.many
          ? [
              {
                header: "Canal",
                cell: (e: EventForOperations) => (
                  <span className="text-xs text-muted-foreground">
                    {channels.byId.get(e.channelId)?.name ?? "—"}
                  </span>
                ),
              },
            ]
          : []),
        {
          header: "Data",
          cell: (e) => (
            <span className="font-mono text-xs text-muted-foreground">{eventWhen(e.startsAt)}</span>
          ),
        },
        {
          header: "",
          numeric: true,
          // Em cartão estes links viram o rodapé, com espaço entre eles — sem
          // isto ficavam encostados à direita a 3px uns dos outros, que é um
          // erro à espera de acontecer num telemóvel numa fila.
          accoes: true,
          cell: (e) => (
            <span className="flex items-center justify-end gap-3.5">
              <Link
                href={`/admin/eventos/${e.id}/transmissao`}
                className="alvo-toque font-sans text-xs font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Transmissão
              </Link>
              {/*
                Bilhetes e scanner só aparecem em eventos que têm bilhete de
                porta. `hasTickets` é um booleano calculado no Postgres — o preço
                nunca sai da base de dados (ver `listEventsForOperations`).
              */}
              {e.hasTickets ? (
                <>
                  <Link
                    href={`/admin/eventos/${e.id}/bilhetes`}
                    className="alvo-toque font-sans text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Bilhetes
                  </Link>
                  <Link
                    href={`${SCANNER_PATH}?evento=${e.id}`}
                    className="alvo-toque font-sans text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Scanner
                  </Link>
                </>
              ) : null}
            </span>
          ),
        },
      ]}
      rows={rows}
      rowKey={(e) => e.id}
    />
  );
}

function OperationsList({
  events,
  channels,
}: {
  events: EventForOperations[];
  channels: ChannelsInScope;
}) {
  const { upcoming, past } = splitEvents(events);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Eventos" meta="o que há para operar" />

      {events.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="Nada por operar"
          description="Quando a liga marcar um evento, ele aparece aqui com os atalhos para a transmissão e para a porta."
        />
      ) : null}

      {upcoming.length > 0 ? (
        <EventsSection title="A seguir" count={upcoming.length}>
          <OperationsTable rows={upcoming} channels={channels} />
        </EventsSection>
      ) : null}

      {past.length > 0 ? (
        <EventsSection title="Já passaram" count={past.length}>
          <OperationsTable rows={past} channels={channels} />
        </EventsSection>
      ) : null}
    </div>
  );
}
