import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HowItWorksCard } from "@/components/eventos/how-it-works-card";
import { PosterPlaceholder } from "@/components/eventos/poster-placeholder";
import { PurchaseCard } from "@/components/eventos/purchase-card";
import { ViewerFooter } from "@/components/eventos/viewer-footer";
import { TicketPurchaseCard } from "@/components/tickets/ticket-purchase-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LiveBadge } from "@/components/ui/live-badge";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { channelPath, defaultChannel } from "@/lib/channels";
import { formatDateTime, formatEuro } from "@/lib/format";
import { requireUser } from "@/server/auth-helper";
import { hasActiveEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  return { title: event?.title ?? "Evento" };
}

const ACCESS_LINES = [
  "O acesso fica na tua conta — entras e vês.",
  "1 sessão de cada vez; o vídeo leva o teu email em marca de água.",
  "Problemas na noite? O suporte responde durante a live.",
];

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) notFound();

  const user = await requireUser();
  const entitled = user ? await hasActiveEntitlement(user.id, eventId) : false;
  const isLive = event.status === "live";

  return (
    <ViewerShell active="inicio" channel={defaultChannel}>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-4 md:pt-6">
        <Link
          href={channelPath(defaultChannel)}
          className="w-fit text-2sm font-medium text-muted-foreground hover:text-foreground"
        >
          ‹ {defaultChannel.name}
        </Link>

        <PosterPlaceholder className="mt-3 aspect-video rounded-sm" />

        <div className="mt-4 flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{formatDateTime(event.startsAt)}</Badge>
            {isLive && <LiveBadge />}
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-display text-balance md:text-3xl">
            {event.title}
          </h1>

          <PurchaseCard
            event={event}
            microcopy="Sem cartão. Recebes o pedido na app MB WAY."
            cta={
              entitled ? (
                <Link
                  href={`/eventos/${eventId}/ver`}
                  className={buttonVariants({ variant: isLive ? "live" : "primary", size: "lg" })}
                >
                  {isLive ? "Ver agora — AO VIVO" : "Ver"}
                </Link>
              ) : (
                <Link
                  href={`/eventos/${eventId}/comprar`}
                  className={buttonVariants({ size: "lg" })}
                >
                  Pagar com MB WAY · {formatEuro(event.priceCents)}
                </Link>
              )
            }
          />

          {event.ticketPriceCents != null && (
            <TicketPurchaseCard eventId={eventId} priceCents={event.ticketPriceCents} />
          )}

          <HowItWorksCard title="Como funciona o acesso" lines={ACCESS_LINES} />
        </div>
      </div>
      <ViewerFooter />
    </ViewerShell>
  );
}
