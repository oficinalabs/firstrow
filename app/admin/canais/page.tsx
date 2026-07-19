import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { tenantStyle } from "@/components/ui/tenant-scope";
import { channelPath } from "@/lib/channels";
import { formatNumber } from "@/lib/format";
import { isPlatformAdmin, manageScope, requireUser } from "@/server/authz";
import { type ChannelSummary, listChannelsInScope } from "@/server/channels";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Canais" };

/*
 * A lista de canais que esta pessoa pode gerir.
 *
 * ISOLAMENTO: aqui não há um canal no URL de onde partir — é uma lista — por
 * isso o que limita é o ÂMBITO, tal como em `/admin/eventos`. `manageScope`
 * devolve `{all:true}` à FirstRow e a lista dos canais de quem é `owner` a
 * todos os outros; uma lista vazia dá ZERO linhas, nunca "sem filtro" (ver
 * `inScope` em server/authz.ts). Sem isto, abrir este ecrã era ficar a saber
 * que ligas existem na plataforma — e a lista de ligas é informação comercial.
 *
 * O gate do layout e o corte do `proxy.ts` já filtraram quem entra no
 * backoffice; isto é a defesa em profundidade que decide o que se vê.
 */
export default async function ChannelsPage() {
  const user = await requireUser({ next: "/admin/canais" });
  const channels = await listChannelsInScope(manageScope(user));

  // Criar canais de raiz é da FirstRow. Esconder o botão é cortesia — quem lá
  // for à mão leva `notFound()` de `requireChannelCreator`.
  const canCreate = isPlatformAdmin(user);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Canais"
        action={
          canCreate ? (
            <Link href="/admin/canais/novo" className={buttonVariants()}>
              Criar canal
            </Link>
          ) : undefined
        }
      />

      {channels.length > 0 ? (
        <Card>
          <CardContent className="pt-2">
            <DataTable<ChannelSummary>
              columns={[
                {
                  header: "Canal",
                  cell: (channel) => (
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        // A cor da liga entra derivada para papel (o backoffice
                        // é claro) — nunca crua, que é como se perde o contraste.
                        style={tenantStyle(channel, "light")}
                        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-(--tenant-soft) font-display text-2xs font-extrabold text-(--tenant)"
                      >
                        {channel.initials}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold">{channel.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {channel.tagline}
                        </span>
                      </span>
                    </span>
                  ),
                },
                {
                  header: "Endereço",
                  cell: (channel) => (
                    <Link
                      href={channelPath(channel)}
                      className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {channelPath(channel)}
                    </Link>
                  ),
                },
                {
                  header: "Eventos",
                  numeric: true,
                  cell: (channel) => formatNumber(channel.events),
                },
                {
                  header: "Membros",
                  numeric: true,
                  cell: (channel) =>
                    channel.owners === 0 ? (
                      // Palavra e não só cor: um canal sem dono é o estado que
                      // interessa ver de relance nesta lista.
                      <Badge variant="warning">sem dono</Badge>
                    ) : (
                      formatNumber(channel.members)
                    ),
                },
                {
                  header: "",
                  numeric: true,
                  cell: (channel) => (
                    <span className="flex items-center justify-end gap-3.5">
                      <Link
                        href={`/admin/canais/${channel.id}`}
                        aria-label={`Editar ${channel.name}`}
                        className="font-sans text-xs font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        Editar
                      </Link>
                      <Link
                        href={`/admin/canais/${channel.id}/membros`}
                        aria-label={`Membros de ${channel.name}`}
                        className="font-sans text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Membros
                      </Link>
                    </span>
                  ),
                },
              ]}
              rows={channels}
              rowKey={(channel) => channel.id}
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          className="mt-4"
          title={canCreate ? "Ainda não há canais" : "Não geres nenhum canal"}
          description={
            canCreate
              ? "Um canal é uma liga: tem endereço próprio, cores próprias e os seus eventos, compradores e dinheiro."
              : "Quando a FirstRow te der um canal, ele aparece aqui com a marca e os membros dele."
          }
          action={
            canCreate ? (
              <Link href="/admin/canais/novo" className={buttonVariants({ size: "lg" })}>
                Criar canal
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
