import { AgendaRowSkeleton } from "@/components/eventos/agenda-list";
import { EventCardSkeleton } from "@/components/eventos/event-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewerShell } from "@/components/ui/viewer-shell";

export default function ChannelLoading() {
  return (
    <ViewerShell active="canal">
      <Skeleton className="h-30 w-full rounded-none md:h-55" />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 md:px-8">
        <div className="-mt-7 flex items-end gap-3 border-b pb-4 md:-mt-10 md:gap-5 md:pb-5">
          <Skeleton className="size-17 border-2 border-background md:size-24" />
          <div className="flex flex-col gap-2 pb-1">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-7 md:mt-6 md:gap-8">
          <Skeleton className="h-80 w-full md:h-70" />
          <div className="grid gap-7 md:grid-cols-[1fr_336px] md:gap-8">
            <div>
              <Skeleton className="h-7 w-28" />
              <div className="mt-3">
                <AgendaRowSkeleton />
                <AgendaRowSkeleton />
                <AgendaRowSkeleton />
              </div>
            </div>
            <Skeleton className="h-56" />
          </div>
          <div className="grid grid-cols-2 gap-3 pb-6 md:grid-cols-4 md:gap-5">
            <EventCardSkeleton />
            <EventCardSkeleton />
            <EventCardSkeleton />
            <EventCardSkeleton />
          </div>
        </div>
      </div>
    </ViewerShell>
  );
}
