import { Skeleton } from "@/components/ui/skeleton";
import { ViewerShell } from "@/components/ui/viewer-shell";

export default function WatchLoading() {
  return (
    <ViewerShell>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-4 md:py-6">
        <Skeleton className="aspect-video w-full" />
        <div className="mt-4 border-b pb-4">
          <Skeleton className="h-7 w-3/5" />
          <Skeleton className="mt-2 h-4 w-2/5" />
        </div>
      </div>
    </ViewerShell>
  );
}
