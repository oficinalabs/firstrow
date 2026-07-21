import { EventTabsSkeleton, PageHeaderSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminEventoBilhetesLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeaderSkeleton />
      <EventTabsSkeleton />
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Skeleton className="h-21" />
        <Skeleton className="h-21" />
        <Skeleton className="h-21" />
        <Skeleton className="h-21" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
