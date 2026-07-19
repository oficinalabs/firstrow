import Link from "next/link";
import { DateBlock } from "@/components/eventos/date-block";
import { PriceTag } from "@/components/eventos/price-tag";
import type { PlatformEvent } from "@/components/home/overview";
import { formatTime } from "@/lib/format";

/*
 * Uma próxima live na visão geral. Difere da agenda do canal por dizer SEMPRE
 * de que canal é — na raiz o evento não tem contexto de canal à volta.
 */
export function UpcomingRow({ event, channel }: PlatformEvent) {
  return (
    <Link
      href={`/eventos/${event.id}`}
      className="group flex items-center gap-4 border-b py-4 last:border-b-0"
    >
      <DateBlock date={event.startsAt} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-2xs uppercase tracking-label text-muted-foreground">
          {channel.name} · {formatTime(event.startsAt)}
        </div>
        <div className="mt-1 text-sm font-semibold decoration-accent decoration-2 underline-offset-4 group-hover:underline">
          {event.title}
        </div>
      </div>
      <PriceTag cents={event.priceCents} className="text-2sm" />
      <span aria-hidden className="text-lg text-muted-foreground/60">
        ›
      </span>
    </Link>
  );
}
