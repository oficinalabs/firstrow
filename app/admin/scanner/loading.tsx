import { Skeleton } from "@/components/ui/skeleton";

export default function AdminScannerLoading() {
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col gap-4 bg-bar p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="h-70 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
