import type { Metadata } from "next";
import Link from "next/link";
import { ChannelEditor } from "@/components/admin/channel-editor";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireChannelManager } from "@/server/channel-access";

export const dynamic = "force-dynamic";

type ChannelParams = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: ChannelParams): Promise<Metadata> {
  const { id } = await params;
  // O mesmo gate do corpo: sem isto, o título da aba de um canal alheio
  // confirmava que ele existe — que é exactamente o que o 404 esconde.
  const { channel } = await requireChannelManager(id, `/admin/canais/${id}`);
  return { title: channel.name };
}

/*
 * Editar a marca de um canal.
 *
 * ISOLAMENTO: o id vem do URL, mas quem decide é `requireChannelManager` —
 * `platform_admin` ou `owner` DESTE canal. O dono da liga A que escreva o id da
 * liga B leva `notFound()`, indistinguível de um id inventado.
 */
export default async function EditChannelPage({ params }: ChannelParams) {
  const { id } = await params;
  const { channel } = await requireChannelManager(id, `/admin/canais/${id}`);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title={channel.name}
        backHref="/admin/canais"
        backLabel="Canais"
        action={
          <Link
            href={`/admin/canais/${channel.id}/membros`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Membros
          </Link>
        }
      />
      <ChannelEditor channel={channel} />
    </div>
  );
}
