import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { type DeleteBlock, DeleteEventDialog } from "@/components/admin/delete-event-dialog";
import { EventStatusBadge } from "@/components/admin/event-status-badge";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatEuro, formatNumber, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canManageEvents } from "@/server/authz";
import { requireEventOperator } from "@/server/event-access";
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

function EventsTable({
  rows,
  sales,
  canManage,
}: {
  rows: EventWithSales[];
  sales: Map<string, number>;
  canManage: boolean;
}) {
  return (
    <DataTable<EventWithSales>
      columns={[
        { header: "Estado", cell: (e) => <EventStatusBadge status={e.status} /> },
        {
          header: "Evento",
          cell: (e) => (
            <span className={cn("font-semibold", e.status === "ended" && "text-muted-foreground")}>
              {e.title}
            </span>
          ),
        },
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
                href={`/admin/eventos/${e.id}/transmissao`}
                className="font-sans text-xs font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {e.status === "ended" ? "Ver" : "Abrir"}
              </Link>
              {canManage ? (
                <DeleteEventDialog
                  eventId={e.id}
                  title={e.title}
                  blocked={deleteBlock(e, sales.get(e.id) ?? 0)}
                />
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
  const user = await requireEventOperator("/admin/eventos");
  const [events, sales] = await Promise.all([listEventsWithSales(), countSalesByEvent()]);

  // Com muitos eventos o que interessa é o que ainda está para vir: os que já
  // passaram descem, em vez de empurrarem o próximo para fora do ecrã.
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.status === "live" || e.startsAt.getTime() >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = events.filter((e) => e.status !== "live" && e.startsAt.getTime() < now);
  const canManage = canManageEvents(user);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Eventos"
        action={
          canManage ? (
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
            canManage ? (
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
            <EventsTable rows={upcoming} sales={sales} canManage={canManage} />
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
            <EventsTable rows={past} sales={sales} canManage={canManage} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
