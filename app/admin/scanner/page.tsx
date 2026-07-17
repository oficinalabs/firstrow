import Link from "next/link";
import { redirect } from "next/navigation";
import { Scanner } from "@/components/tickets/scanner";
import { EmptyState } from "@/components/ui/empty-state";
import { isAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth-helper";
import { getEvent, listEvents } from "@/server/events";
import { getEventTicketStats } from "@/server/tickets";

export const dynamic = "force-dynamic";

// Scanner de porta — fullscreen, sem shell. ?evento=<id> escolhe o evento;
// sem query mostra o seletor (a caminho da porta escolhe-se uma vez).
export default async function AdminScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>;
}) {
  const user = await requireUser();
  if (!user || !isAdmin(user.email)) redirect("/");

  const { evento } = await searchParams;

  if (evento) {
    const event = await getEvent(evento);
    if (event) {
      const stats = await getEventTicketStats(event.id);
      return (
        <Scanner
          eventoId={event.id}
          eventoTitulo={event.title}
          vendidos={stats.vendidos}
          entraram={stats.entraram}
        />
      );
    }
  }

  const events = await listEvents();
  const comBilhetes = events.filter((e) => e.ticketPriceCents != null);

  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-bar text-bar-foreground">
      <header className="px-4 py-5">
        <h1 className="font-display text-xl font-extrabold tracking-display">Scanner de porta</h1>
        <p className="mt-1 font-mono text-2xs text-bar-muted">escolhe o evento desta porta</p>
      </header>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-8">
        {comBilhetes.length === 0 ? (
          <EmptyState
            title="Nenhum evento com bilhetes"
            description="Cria um evento com preço de bilhete físico para poderes validar entradas."
          />
        ) : (
          comBilhetes.map((e) => (
            <Link
              key={e.id}
              href={`/admin/scanner?evento=${e.id}`}
              className="flex items-center justify-between rounded-sm border border-bar-border bg-bar-active px-4 py-3.5 transition-colors hover:border-bar-muted"
            >
              <span className="text-sm font-semibold">{e.title}</span>
              <span className="font-mono text-2xs uppercase text-bar-muted">
                {formatDateTime(e.startsAt)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
