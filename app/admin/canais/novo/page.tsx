import type { Metadata } from "next";
import { ChannelEditor } from "@/components/admin/channel-editor";
import { PageHeader } from "@/components/admin/page-header";
import { requireChannelCreator } from "@/server/channel-access";

export const metadata: Metadata = { title: "Criar canal" };

/*
 * Criar um canal — só a FirstRow.
 *
 * Um dono de liga edita o que é dele e convida quem quiser para lá dentro, mas
 * não abre ligas novas: cada canal é um contrato, e quem os abre é quem os
 * assina. `requireChannelCreator` responde `notFound()` a quem não for — nem
 * precisa de saber que este ecrã existe.
 */
export default async function NewChannelPage() {
  await requireChannelCreator("/admin/canais/novo");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Criar canal" backHref="/admin/canais" backLabel="Canais" />
      <ChannelEditor />
    </div>
  );
}
