import Link from "next/link";
import { DateBlock } from "@/components/eventos/date-block";
import type { EventRow } from "@/components/eventos/program";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEuro, formatTime } from "@/lib/format";

/** Agenda do canal: uma linha por evento anunciado, a apontar à página dele. */
export function AgendaList({ events }: { events: EventRow[] }) {
  return (
    <div>
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/eventos/${event.id}`}
          className="group flex items-center gap-4 border-b py-3.5 last:border-b-0"
        >
          <DateBlock date={event.startsAt} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold decoration-accent decoration-2 underline-offset-4 group-hover:underline">
              {event.title}
            </div>
            <div className="mt-0.5 text-2sm text-muted-foreground">
              {formatTime(event.startsAt)} · Acesso live {formatEuro(event.priceCents)}
            </div>
          </div>
          <span aria-hidden className="text-lg text-muted-foreground/60">
            ›
          </span>
        </Link>
      ))}
    </div>
  );
}

export function AgendaRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b py-3.5">
      <Skeleton className="h-10 w-11" />
      <div className="flex-1">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="mt-1.5 h-3.5 w-2/5" />
      </div>
    </div>
  );
}
