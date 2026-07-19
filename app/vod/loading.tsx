import { EventCardSkeleton } from "@/components/eventos/event-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewerShell } from "@/components/ui/viewer-shell";

const SLOTS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

export default function VodLoading() {
  return (
    <ViewerShell active="inicio">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 md:px-8 md:pt-6">
        <Skeleton className="h-8 w-52" />
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
          {SLOTS.map((slot) => (
            <EventCardSkeleton key={slot} />
          ))}
        </div>
      </div>
    </ViewerShell>
  );
}
