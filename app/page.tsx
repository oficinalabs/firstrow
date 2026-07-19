import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/eventos/event-card";
import { COMO_FUNCIONA, HowItWorksCard } from "@/components/eventos/how-it-works-card";
import { LiveNowBanner } from "@/components/eventos/live-now-banner";
import { ViewerFooter } from "@/components/eventos/viewer-footer";
import { ChannelRow } from "@/components/home/channel-row";
import { buildOverview, type PlatformOverview } from "@/components/home/overview";
import { UpcomingRow } from "@/components/home/upcoming-row";
import { SITE_URL } from "@/components/marketing/dados";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { listEvents } from "@/server/events";

export const dynamic = "force-dynamic";

const DESCRICAO =
  "Lives com acesso pago, arquivo e bilhetes dos canais da FirstRow. Compras com MB WAY " +
  "e vês onde quiseres — quem não paga, não entra.";

export const metadata: Metadata = {
  title: { absolute: "FirstRow — lives dos canais que valem a pena pagar" },
  description: DESCRICAO,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: "FirstRow — lives dos canais que valem a pena pagar",
    description: DESCRICAO,
    url: `${SITE_URL}/`,
    type: "website",
  },
};

// Régua de secção do design: título com filete forte por baixo.
const SECTION_RULE = "border-b-2 border-foreground pb-3";

/*
 * Raiz da plataforma: visão geral de TODOS os canais — nunca a página de um
 * canal (essa vive em /canal/[slug]). Lista, não montra: com um canal só tem de
 * continuar a ler-se como uma plataforma a começar, não como uma página vazia.
 */
export default async function HomePage() {
  let overview: PlatformOverview | null = null;
  try {
    overview = buildOverview(await listEvents());
  } catch {
    overview = null;
  }

  return (
    <ViewerShell active="inicio">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 md:px-8">
        {overview !== null && overview.live.length > 0 ? (
          <div className="flex flex-col gap-3 pt-5 md:pt-6">
            {overview.live.map(({ event, channel }) => (
              <LiveNowBanner key={event.id} event={event} channelName={channel.name} />
            ))}
          </div>
        ) : null}

        <section className="grid gap-8 py-10 md:grid-cols-[1fr_336px] md:items-start md:gap-12 md:py-14">
          <div>
            <h1 className="font-display text-2xl font-extrabold leading-[1.08] tracking-display text-balance md:text-3xl">
              O que está a dar na FirstRow
            </h1>
            <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-foreground-secondary md:text-base">
              {DESCRICAO}
            </p>
          </div>
          <HowItWorksCard title="Como funciona" lines={COMO_FUNCIONA} />
        </section>

        {overview === null ? (
          <EmptyState
            className="mb-14"
            title="Não conseguimos carregar a programação"
            description="Foi um problema do nosso lado, não teu. Recarrega a página — se continuar, volta a tentar daqui a uns minutos."
            action={
              <Link href="/" className={buttonVariants({ variant: "secondary" })}>
                Recarregar
              </Link>
            }
          />
        ) : (
          <Programacao overview={overview} />
        )}

        {/* Entrada para criadores: uma linha e um link, sem virar landing page. */}
        <section className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t py-6">
          <p className="max-w-[56ch] text-2sm leading-relaxed text-muted-foreground">
            Tens público que paga para te ver? A FirstRow abre canais a ligas, comédia, música e
            formação — com bilhetes à porta e lives que não fogem para links piratas.
          </p>
          <Link
            href="/criadores"
            className="text-2sm font-medium text-accent decoration-2 underline-offset-4 hover:underline"
          >
            Abrir um canal ›
          </Link>
        </section>
      </div>
      <ViewerFooter />
    </ViewerShell>
  );
}

function Programacao({ overview }: { overview: PlatformOverview }) {
  const { upcoming, archive, channels } = overview;

  return (
    <>
      <section aria-label="Canais" className="pb-12 md:pb-14">
        <SectionHeader title="Canais" className={SECTION_RULE} />
        <div className="mt-1">
          {channels.map((summary) => (
            <ChannelRow key={summary.channel.slug} {...summary} />
          ))}
        </div>
      </section>

      <section aria-label="Próximas lives" className="pb-12 md:pb-14">
        <SectionHeader title="Próximas lives" className={SECTION_RULE} />
        {upcoming.length > 0 ? (
          <div className="mt-1">
            {upcoming.map(({ event, channel }) => (
              <UpcomingRow key={event.id} event={event} channel={channel} />
            ))}
          </div>
        ) : (
          <p className="py-5 text-2sm text-muted-foreground">
            Sem datas marcadas neste momento — assim que houver, aparecem aqui primeiro.
          </p>
        )}
      </section>

      <section aria-label="Arquivo" className="pb-12 md:pb-14">
        <SectionHeader
          title="Arquivo"
          className={SECTION_RULE}
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
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {archive.slice(0, 4).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-5"
            title="O arquivo estreia depois da primeira live"
            description="Cada evento fica disponível aqui como replay depois do direto — de todos os canais."
          />
        )}
      </section>
    </>
  );
}
