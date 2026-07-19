import { PageHeaderSkeleton, TableCardSkeleton } from "@/components/admin/skeletons";

/** Mesmas duas colunas do `ChannelForm` — identidade/cores à esquerda,
 *  pré-visualização à direita — para o ecrã não saltar quando os dados chegam. */
export default function EditChannelLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeaderSkeleton />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <TableCardSkeleton rows={5} />
        <TableCardSkeleton rows={3} />
      </div>
    </div>
  );
}
