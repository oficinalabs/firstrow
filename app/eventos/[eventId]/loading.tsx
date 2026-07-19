import { Skeleton } from "@/components/ui/skeleton";
import { ViewerShell } from "@/components/ui/viewer-shell";

export default function EventLoading() {
  return (
    <ViewerShell active="inicio">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-4 md:pt-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 aspect-video" />
        <div className="mt-4 flex flex-col gap-3.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </ViewerShell>
  );
}
