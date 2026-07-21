import Link from "next/link";
import { EventThumbnail } from "@/components/eventos/event-thumbnail";
import { type EventRow, eventThumbnailPath } from "@/components/eventos/program";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// Cartão de arquivo/VOD. `grid` nas grelhas (canal e /vod, aponta à página do
// evento); `row` na lista lateral do player, a trocar diretamente de emissão.
export function EventCard({
  event,
  layout = "grid",
  active = false,
  className,
}: {
  event: EventRow;
  layout?: "grid" | "row";
  active?: boolean;
  className?: string;
}) {
  if (layout === "row") {
    return (
      <Link
        href={`/eventos/${event.id}/ver`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex gap-3 rounded-sm border-l-2 p-2.5 transition-colors",
          active ? "border-l-accent bg-card" : "border-l-transparent hover:bg-card/60",
          className,
        )}
      >
        <EventThumbnail
          src={eventThumbnailPath(event)}
          label="replay"
          className="aspect-video w-30 shrink-0 rounded-xs"
        />
        <div className="min-w-0 py-0.5">
          <div className="line-clamp-2 text-2sm font-semibold leading-snug">{event.title}</div>
          <div className="mt-1 font-mono text-2xs text-muted-foreground">
            {active ? "a ver agora" : formatDate(event.startsAt)}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/eventos/${event.id}`} className={cn("group block", className)}>
      <EventThumbnail
        src={eventThumbnailPath(event)}
        label="replay"
        className="aspect-video rounded-sm"
      />
      <div className="mt-2 line-clamp-2 text-sm font-semibold leading-snug group-hover:underline group-hover:decoration-accent group-hover:decoration-2 group-hover:underline-offset-4">
        {event.title}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {formatDate(event.startsAt)} · Replay
      </div>
    </Link>
  );
}

export function EventCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-video" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <Skeleton className="mt-1.5 h-3 w-2/5" />
    </div>
  );
}
