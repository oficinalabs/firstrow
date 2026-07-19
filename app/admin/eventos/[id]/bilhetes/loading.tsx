import { Skeleton } from "@/components/ui/skeleton";

export default function AdminEventoBilhetesLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-9 w-64" />
      </div>
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
