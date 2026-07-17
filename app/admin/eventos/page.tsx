import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { EventStatusBadge } from "@/components/admin/event-status-badge";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatEuro, formatNumber, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type EventWithSales, listEventsWithSales } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Eventos" };

function eventWhen(startsAt: Date): string {
  const day = formatDate(startsAt);
  return `${day === formatDate(new Date()) ? "hoje" : day} ${formatTime(startsAt)}`;
}

export default async function AdminEventsPage() {
  const events = await listEventsWithSales();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Eventos"
        action={
          <Link href="/admin/eventos/novo" className={buttonVariants()}>
            Criar evento
          </Link>
        }
      />

      {events.length > 0 ? (
        <Card>
          <CardContent className="pt-2">
            {/* TODO(frente-d): coluna BILHETES (vendidos/lotação) quando a
                tabela tickets chegar ao schema. */}
            <DataTable<EventWithSales>
              columns={[
                { header: "Estado", cell: (e) => <EventStatusBadge status={e.status} /> },
                {
                  header: "Evento",
                  cell: (e) => (
                    <span
                      className={cn(
                        "font-semibold",
                        e.status === "ended" && "text-muted-foreground",
                      )}
                    >
                      {e.title}
                    </span>
                  ),
                },
                {
                  header: "Data",
                  cell: (e) => (
                    <span className="font-mono text-xs text-muted-foreground">
                      {eventWhen(e.startsAt)}
                    </span>
                  ),
                },
                { header: "PPV", numeric: true, cell: (e) => formatEuro(e.priceCents) },
                { header: "Compradores", numeric: true, cell: (e) => formatNumber(e.buyers) },
                { header: "Receita", numeric: true, cell: (e) => formatEuro(e.revenueCents) },
                {
                  header: "",
                  numeric: true,
                  cell: (e) => (
                    <Link
                      href={`/admin/eventos/${e.id}/transmissao`}
                      className="font-sans text-xs font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      {e.status === "ended" ? "Ver" : "Abrir"}
                    </Link>
                  ),
                },
              ]}
              rows={events}
              rowKey={(e) => e.id}
            />
          </CardContent>
        </Card>
      ) : (
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
      )}
    </div>
  );
}
