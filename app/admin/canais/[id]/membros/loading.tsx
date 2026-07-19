import { PageHeaderSkeleton, TableCardSkeleton } from "@/components/admin/skeletons";

export default function ChannelMembersLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeaderSkeleton />
      <TableCardSkeleton rows={3} />
      <TableCardSkeleton rows={2} />
    </div>
  );
}
