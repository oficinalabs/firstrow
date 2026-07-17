import { PageHeaderSkeleton, TableCardSkeleton } from "@/components/admin/skeletons";

export default function EarningsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeaderSkeleton />
      <TableCardSkeleton rows={4} />
    </div>
  );
}
