import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessCard } from "@/components/eventos/access-card";
import { AgendaList } from "@/components/eventos/agenda-list";
import { ChannelHeader } from "@/components/eventos/channel-header";
import { EventCard } from "@/components/eventos/event-card";
import { COMO_FUNCIONA, HowItWorksCard } from "@/components/eventos/how-it-works-card";
import { LiveNowBanner } from "@/components/eventos/live-now-banner";
import { NextLiveCard } from "@/components/eventos/next-live-card";
import { type ChannelProgram, type EventRow, splitProgram } from "@/components/eventos/program";
import { ViewerFooter } from "@/components/eventos/viewer-footer";
import { SITE_URL } from "@/components/marketing/dados";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { type Channel, channelPath, getChannel, groupEventsByChannel } from "@/lib/channels";
import { listEvents } from "@/server/events";

export const dynamic = "force-dynamic";

type ChannelParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: ChannelParams): Promise<Metadata> {
  const { slug } = await params;
  const channel = getChannel(slug);
  if (!channel) return { title: "Canal não encontrado" };

  return {
    title: channel.name,
    description: `${channel.tagline}. Lives com acesso pago por MB WAY e replays no canal ${channel.name}, na FirstRow.`,
    alternates: { canonical: `${SITE_URL}${channelPath(channel)}` },
  };
}

export default async function ChannelPage({ params }: ChannelParams) {
  const { slug } = await params;
  const channel = getChannel(slug);
  if (!channel) notFound();

  // Sem canal na BD (Fase 0), o agrupamento é que decide o que é deste canal.
  let rows: EventRow[] | null = null;
  try {
    rows = groupEventsByChannel(await listEvents()).get(channel.slug) ?? [];
  } catch {
    rows = null;
  }

  return (
    <ViewerShell active="inicio" channel={channel}>
      <ChannelHeader channel={channel} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-4 pt-5 md:gap-8 md:px-8 md:pt-6">
        {rows === null ? (
          <EmptyState
            title="Não conseguimos carregar o canal"
            description="Foi um problema do nosso lado, não teu. Recarrega a página — se continuar, volta a tentar daqui a uns minutos."
            action={
              <Link
                href={channelPath(channel)}
                className={buttonVariants({ variant: "secondary" })}
              >
                Recarregar
              </Link>
            }
          />
        ) : (
          <ChannelContent channel={channel} program={splitProgram(rows)} />
        )}
      </div>
      <ViewerFooter />
    </ViewerShell>
  );
}

function ChannelContent({ channel, program }: { channel: Channel; program: ChannelProgram }) {
  const { liveNow, nextLive, upcoming, archive } = program;

  if (!liveNow && !nextLive && archive.length === 0) {
    return (
      <>
        <EmptyState
          title="Ainda não há eventos anunciados"
          description={`A próxima live do ${channel.name} vai aparecer aqui, com data, preço e contagem decrescente.`}
        />
        <HowItWorksCard title="Como funciona" lines={COMO_FUNCIONA} className="md:max-w-84" />
      </>
    );
  }

  return (
    <>
      {/* Coluna principal (live + próxima + agenda) e barra lateral, como no design. */}
      <div className="grid gap-7 md:grid-cols-[1fr_336px] md:gap-8">
        <div className="flex min-w-0 flex-col gap-7">
          {liveNow && <LiveNowBanner event={liveNow} />}
          {nextLive && <NextLiveCard event={nextLive} />}
          <section aria-label="Agenda">
            <SectionHeader title="Agenda" />
            {upcoming.length > 0 ? (
              <AgendaList events={upcoming} />
            ) : (
              <p className="py-4 text-2sm text-muted-foreground">
                Sem mais datas marcadas — quando houver, aparecem aqui.
              </p>
            )}
          </section>
        </div>
        <div className="flex flex-col gap-5">
          <AccessCard upcoming={upcoming} />
          <HowItWorksCard title="Como funciona" lines={COMO_FUNCIONA} />
        </div>
      </div>
      <section aria-label="Arquivo" className="pb-2">
        <SectionHeader
          title="Arquivo"
          action={
            archive.length > 0 ? (
              <Link
                href="/vod"
                className="text-2sm font-medium text-accent decoration-2 underline-offset-4 hover:underline"
              >
                Ver tudo ({archive.length}) ›
              </Link>
            ) : undefined
          }
        />
        {archive.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {archive.slice(0, 4).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            title="O arquivo estreia depois da primeira live"
            description="Cada evento fica disponível aqui como replay depois do direto."
          />
        )}
      </section>
    </>
  );
}
