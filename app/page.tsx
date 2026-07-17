import type { Metadata } from "next";
import Link from "next/link";
import { AccessCard } from "@/components/eventos/access-card";
import { AgendaList } from "@/components/eventos/agenda-list";
import { ChannelHeader } from "@/components/eventos/channel-header";
import { EventCard } from "@/components/eventos/event-card";
import { HowItWorksCard } from "@/components/eventos/how-it-works-card";
import { LiveNowBanner } from "@/components/eventos/live-now-banner";
import { NextLiveCard } from "@/components/eventos/next-live-card";
import { type ChannelProgram, type EventRow, splitProgram } from "@/components/eventos/program";
import { ViewerFooter } from "@/components/eventos/viewer-footer";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { tenant } from "@/lib/tenant";
import { listEvents } from "@/server/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: tenant.name,
  description: `${tenant.tagline}. Lives com acesso pago por MB WAY e replays no canal ${tenant.name}, na FirstRow.`,
};

const HOW_IT_WORKS = [
  "Compras com MB WAY, sem cartão.",
  "O acesso é da tua conta — 1 sessão de cada vez.",
  "Nada de links: quem não paga, não entra.",
];

export default async function ChannelPage() {
  let rows: EventRow[] | null = null;
  try {
    rows = await listEvents();
  } catch {
    rows = null;
  }

  return (
    <ViewerShell active="canal">
      <ChannelHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-4 pt-5 md:gap-8 md:px-8 md:pt-6">
        {rows === null ? (
          <EmptyState
            title="Não conseguimos carregar o canal"
            description="Foi um problema do nosso lado, não teu. Recarrega a página — se continuar, volta a tentar daqui a uns minutos."
            action={
              <Link href="/" className={buttonVariants({ variant: "secondary" })}>
                Recarregar
              </Link>
            }
          />
        ) : (
          <ChannelContent program={splitProgram(rows)} />
        )}
      </div>
      <ViewerFooter />
    </ViewerShell>
  );
}

function ChannelContent({ program }: { program: ChannelProgram }) {
  const { liveNow, nextLive, upcoming, archive } = program;

  if (!liveNow && !nextLive && archive.length === 0) {
    return (
      <>
        <EmptyState
          title="Ainda não há eventos anunciados"
          description={`A próxima live do ${tenant.name} vai aparecer aqui, com data, preço e contagem decrescente.`}
        />
        <HowItWorksCard title="Como funciona" lines={HOW_IT_WORKS} className="md:max-w-84" />
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
          <HowItWorksCard title="Como funciona" lines={HOW_IT_WORKS} />
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
