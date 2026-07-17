import {
  PageHeaderSkeleton,
  StatRowSkeleton,
  TableCardSkeleton,
} from "@/components/admin/skeletons";

export default function AdminDashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeaderSkeleton />
      <StatRowSkeleton />
      <TableCardSkeleton rows={6} />
    </div>
  );
}
