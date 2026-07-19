import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/eventos/event-card";
import { type EventRow, splitProgram } from "@/components/eventos/program";
import { ViewerFooter } from "@/components/eventos/viewer-footer";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { type Channel, channelPath } from "@/lib/channels";
import { getChannel } from "@/server/channels";
import { listEvents, listEventsByChannel } from "@/server/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arquivo",
  description: "Os replays dos canais da FirstRow.",
};

type VodParams = { searchParams: Promise<{ canal?: string }> };

/*
 * Arquivo. Duas leituras da mesma página, e o `?canal=` é que as separa:
 *
 *   /vod              → replays de TODA a plataforma, sem marca de canal
 *   /vod?canal=<slug> → só os desse canal, com a marca dele
 *
 * O parâmetro existe porque o "Ver tudo ›" do arquivo de um canal aponta para
 * aqui. Sem ele, esta página mostrava os replays da plataforma inteira debaixo
 * do nome de um canal só — com uma liga não se notava, com duas passava a ser
 * o arquivo de uma liga a mostrar os eventos da outra.
 */
export default async function VodPage({ searchParams }: VodParams) {
  const { canal } = await searchParams;

  let channel: Channel | null = null;
  let archive: EventRow[] | null = null;
  try {
    channel = canal ? await getChannel(canal) : null;
    // Slug desconhecido cai no arquivo da plataforma — é uma página pública de
    // leitura, não vale um 404 a quem seguiu um link antigo.
    const rows = channel ? await listEventsByChannel(channel.id) : await listEvents();
    archive = splitProgram(rows).archive;
  } catch {
    archive = null;
  }

  const voltar = channel
    ? { href: channelPath(channel), label: "‹ Voltar ao canal" }
    : { href: "/", label: "‹ Voltar ao início" };

  return (
    <ViewerShell active="inicio" channel={channel ?? undefined}>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-5 md:px-8 md:pt-6">
        <SectionHeader
          eyebrow={channel?.name}
          title={channel ? "Arquivo do canal" : "Arquivo"}
          action={
            <Link href={voltar.href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {voltar.label}
            </Link>
          }
        />

        {archive === null ? (
          <EmptyState
            className="mt-6"
            title="Não conseguimos carregar o arquivo"
            description="Foi um problema do nosso lado. Recarrega a página — se continuar, tenta daqui a uns minutos."
            action={
              <Link href="/vod" className={buttonVariants({ variant: "secondary" })}>
                Recarregar
              </Link>
            }
          />
        ) : archive.length === 0 ? (
          <EmptyState
            className="mt-6"
            title="O arquivo estreia depois da primeira live"
            description={
              channel
                ? "Cada evento fica disponível aqui como replay depois do direto. Volta ao canal para veres a próxima."
                : "Cada evento fica disponível aqui como replay depois do direto, de todos os canais."
            }
            action={
              <Link href={voltar.href} className={buttonVariants()}>
                {channel ? "Ver o canal" : "Ver os canais"}
              </Link>
            }
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 pb-2 md:grid-cols-4 md:gap-5">
            {archive.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
      <ViewerFooter />
    </ViewerShell>
  );
}
