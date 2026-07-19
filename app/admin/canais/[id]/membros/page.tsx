import type { Metadata } from "next";
import Link from "next/link";
import { ChannelMembers } from "@/components/admin/channel-members";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireChannelManager } from "@/server/channel-access";
import { listChannelMembers } from "@/server/channel-members";

export const dynamic = "force-dynamic";

type MembersParams = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: MembersParams): Promise<Metadata> {
  const { id } = await params;
  const { channel } = await requireChannelManager(id, `/admin/canais/${id}/membros`);
  return { title: `Membros · ${channel.name}` };
}

/*
 * Quem manda num canal.
 *
 * ISOLAMENTO: o mesmo gate do ecrã de marca — `platform_admin` ou `owner` DESTE
 * canal. Pesa mais aqui do que lá: esta página traz NOME e EMAIL de pessoas, e
 * o `staff` não entra (opera a transmissão e a porta, não decide quem manda).
 *
 * O gate corre ANTES da query dos membros, e de propósito: no App Router a
 * página corre em paralelo com o layout, por isso o que impede os emails de
 * irem no payload é a ordem aqui dentro — mais o corte do `proxy.ts`, que é
 * quem trava o pedido antes de esta página sequer existir.
 */
export default async function ChannelMembersPage({ params }: MembersParams) {
  const { id } = await params;
  const { user, channel } = await requireChannelManager(id, `/admin/canais/${id}/membros`);
  const members = await listChannelMembers(channel.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        title="Membros"
        meta={channel.name}
        backHref="/admin/canais"
        backLabel="Canais"
        action={
          <Link
            href={`/admin/canais/${channel.id}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Editar canal
          </Link>
        }
      />
      <ChannelMembers
        channelId={channel.id}
        channelName={channel.name}
        members={members}
        viewerId={user.id}
      />
    </div>
  );
}
