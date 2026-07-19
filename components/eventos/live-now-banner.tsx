import Link from "next/link";
import type { EventRow } from "@/components/eventos/program";
import { buttonVariants } from "@/components/ui/button";
import { LiveBadge } from "@/components/ui/live-badge";

/*
 * Barra de emissão a decorrer — a única cor que grita. `channelName` só é
 * preciso na visão geral, onde o evento não tem o canal à volta dele.
 */
export function LiveNowBanner({ event, channelName }: { event: EventRow; channelName?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-sm border border-live/30 bg-live/10 p-3 md:px-4">
      <LiveBadge />
      <span className="min-w-0 flex-1 text-sm font-semibold">
        {event.title}
        {channelName ? (
          <span className="font-normal text-muted-foreground"> · {channelName}</span>
        ) : null}
      </span>
      <Link
        href={`/eventos/${event.id}/ver`}
        className={buttonVariants({ variant: "live", size: "lg" })}
      >
        Ver agora
      </Link>
    </div>
  );
}
