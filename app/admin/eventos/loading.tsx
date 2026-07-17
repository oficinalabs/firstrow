import { PageHeaderSkeleton, TableCardSkeleton } from "@/components/admin/skeletons";

export default function AdminEventsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeaderSkeleton />
      <TableCardSkeleton rows={5} />
    </div>
  );
}
