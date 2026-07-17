import { Skeleton } from "@/components/ui/skeleton";
import { ViewerShell } from "@/components/ui/viewer-shell";

export default function BilhetesLoading() {
  return (
    <ViewerShell active="bilhetes">
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-100 w-full" />
        <Skeleton className="h-16 w-full" />
      </section>
    </ViewerShell>
  );
}
