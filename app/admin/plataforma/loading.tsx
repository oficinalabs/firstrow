import { PageHeaderSkeleton, StatRowSkeleton } from "@/components/admin/skeletons";

export default function PlatformLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeaderSkeleton />
      <StatRowSkeleton />
    </div>
  );
}
