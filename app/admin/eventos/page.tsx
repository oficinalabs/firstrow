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
import { eventHubPath } from "@/lib/event-rules";
import { formatDate, formatEuro, formatNumber, formatTime } from "@/lib/format";
import { canEnterBackoffice, canManageEvents, operateScope, requireUser } from "@/server/authz";
import { type ChannelsInScope, channelsInScope } from "@/server/channels";
import { countSalesByEvent } from "@/server/events";
import { type EventWithSales, listEventsWithSales } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Eventos" };

function eventWhen(startsAt: Date): string {
  const day = formatDate(startsAt);
  return `${day === formatDate(new Date()) ? "hoje" : day} ${formatTime(startsAt)}`;
}

/** Porque é que este evento não se apaga (se for o caso) — a mesma regra do servidor. */
function deleteBlock(event: EventWithSales, sales: number): DeleteBlock | undefined {
  if (event.status === "live") return { reason: "live" };
  if (sales > 0) return { reason: "sales", sales };
  return undefined;
}

/*
 * `canManage` é uma FUNÇÃO e não um booleano porque a resposta passou a ser por
 * linha: quem opera dois canais pode ser dono de um e só equipa no outro, e o
 * botão de apagar tem de seguir o canal do evento, não o papel da pessoa.
 */
function EventsTable({
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
          cell: (e) => (
            <span className="flex items-center justify-end gap-3.5">
              <Link
                href={eventHubPath(e.id)}
                className="font-sans text-xs font-semibold text-foreground underline-offset-4 hover:underline"
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
                    className="font-sans text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
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

export default async function AdminEventsPage() {
  // Defesa em profundidade: o layout do backoffice já filtra, a página confirma.
  // Aqui não há um evento de onde tirar o canal — é uma lista — por isso o que
  // limita é o ÂMBITO: só entram os eventos dos canais desta pessoa.
  const user = await requireUser({ next: "/admin/eventos" });
  const scope = operateScope(user);

  const [events, sales, channels] = await Promise.all([
    listEventsWithSales(scope),
    countSalesByEvent(scope),
    // O MESMO âmbito das outras duas: a lista de canais que dá nome às linhas
    // não pode ser mais larga do que a lista de eventos que se mostra.
    channelsInScope(scope),
  ]);

  // Com muitos eventos o que interessa é o que ainda está para vir: os que já
  // passaram descem, em vez de empurrarem o próximo para fora do ecrã.
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.status === "live" || e.startsAt.getTime() >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = events.filter((e) => e.status !== "live" && e.startsAt.getTime() < now);
  const canManage = (event: EventWithSales) => canManageEvents(user, event.channelId);
  // Criar exige ser dono de algum canal — em qual é que ele nasce decide-se em
  // `resolveChannelForNewEvent`, e não aqui.
  const canCreate = canEnterBackoffice(user);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Eventos"
        action={
          canCreate ? (
            <Link href="/admin/eventos/novo" className={buttonVariants()}>
              Criar evento
            </Link>
          ) : undefined
        }
      />

      {events.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="Cria o primeiro evento"
          description="A lista de eventos, os compradores e a receita de cada um vivem aqui."
          action={
            canCreate ? (
              <Link href="/admin/eventos/novo" className={buttonVariants({ size: "lg" })}>
                Criar evento
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {/* TODO(frente-d): coluna BILHETES (vendidos/lotação) — server/stats.ts
          ainda não junta a tabela tickets à lista de eventos. */}
      {upcoming.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle>A seguir</CardTitle>
            <span className="font-mono text-2xs text-muted-foreground">
              {formatNumber(upcoming.length)}
            </span>
          </CardHeader>
          <CardContent>
            <EventsTable rows={upcoming} sales={sales} canManage={canManage} channels={channels} />
          </CardContent>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle>Já passaram</CardTitle>
            <span className="font-mono text-2xs text-muted-foreground">
              {formatNumber(past.length)}
            </span>
          </CardHeader>
          <CardContent>
            <EventsTable rows={past} sales={sales} canManage={canManage} channels={channels} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
