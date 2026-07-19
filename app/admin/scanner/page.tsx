import Link from "next/link";
import { Scanner } from "@/components/tickets/scanner";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import { operateScope, requireUser } from "@/server/authz";
import { permitEventOperation } from "@/server/event-access";
import { listEventsInScope } from "@/server/events";
import { getEventTicketStats } from "@/server/tickets";

export const dynamic = "force-dynamic";

// Scanner de porta — fullscreen, sem shell. ?evento=<id> escolhe o evento;
// sem query mostra o seletor (a caminho da porta escolhe-se uma vez).
export default async function AdminScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>;
}) {
  const { evento } = await searchParams;

  /*
   * Validar bilhetes à porta é operar o evento — e é o canal DELE que decide.
   * Um evento que não existe e um evento de outra liga caem os dois no seletor,
   * de propósito: da porta não se distingue um do outro.
   *
   * (O layout do /admin ainda corta em `canEnterBackoffice`, que exige ser
   * dono de um canal, por isso a equipa não chega aqui — ver
   * docs/SEGURANCA-APP.md.)
   */
  if (evento) {
    const permit = await permitEventOperation(evento);
    if (permit.ok) {
      const stats = await getEventTicketStats(permit.event.id);
      return (
        <Scanner
          eventoId={permit.event.id}
          eventoTitulo={permit.event.title}
          vendidos={stats.vendidos}
          entraram={stats.entraram}
        />
      );
    }
  }

  const user = await requireUser({ next: "/admin/scanner" });
  const events = await listEventsInScope(operateScope(user));
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
