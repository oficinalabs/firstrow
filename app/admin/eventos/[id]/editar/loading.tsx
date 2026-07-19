import { PageHeaderSkeleton, TableCardSkeleton } from "@/components/admin/skeletons";

export default function EditEventLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeaderSkeleton />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <TableCardSkeleton rows={4} />
        <div className="flex flex-col gap-4">
          <TableCardSkeleton rows={2} />
          <TableCardSkeleton rows={2} />
        </div>
      </div>
    </div>
  );
}
