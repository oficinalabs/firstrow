import {
  EventTabsSkeleton,
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "@/components/admin/skeletons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TransmissionLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeaderSkeleton />
      <EventTabsSkeleton />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3.5">
            <Card className="flex flex-col gap-3 px-4 py-3.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-20" />
            </Card>
            <Card className="flex flex-col gap-3 px-4 py-3.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-7 w-14" />
            </Card>
          </div>
          <TableCardSkeleton rows={3} />
        </div>
        <div className="flex flex-col gap-3.5">
          <TableCardSkeleton rows={2} />
          <TableCardSkeleton rows={2} />
        </div>
      </div>
    </div>
  );
}
