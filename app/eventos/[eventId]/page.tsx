import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HowItWorksCard } from "@/components/eventos/how-it-works-card";
import { PosterPlaceholder } from "@/components/eventos/poster-placeholder";
import { PurchaseCard } from "@/components/eventos/purchase-card";
import { ViewerFooter } from "@/components/eventos/viewer-footer";
import { TicketPurchaseCard } from "@/components/tickets/ticket-purchase-card";
import { BackofficeLink } from "@/components/ui/backoffice-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LiveBadge } from "@/components/ui/live-badge";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { channelPath } from "@/lib/channels";
import { summarizeDescription } from "@/lib/event-rules";
import { formatDateTime, formatEuro } from "@/lib/format";
import { copiaCliente } from "@/lib/legal/consentimentos";
import { requireUser } from "@/server/auth-helper";
import { getChannelById } from "@/server/channels";
import { hasActiveEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";

export const dynamic = "force-dynamic";

/**
 * Tamanho do resumo que vai nas meta tags.
 *
 * ~200 é o que o WhatsApp, o Instagram e a pesquisa mostram antes de cortarem
 * eles próprios — e um corte deles é a meio de uma palavra. Cortamos nós, numa
 * fronteira de palavra e com reticência (ver `summarizeDescription`).
 */
const SHARE_SUMMARY_LENGTH = 200;

/*
 * O TEXTO DE PARTILHA. Quando alguém cola o link do evento no WhatsApp ou no
 * Instagram, é isto que aparece: título + descrição. Enquanto não houver botão
 * de partilhar (A4), este é o texto de partilha que existe de facto — e é o
 * mesmo texto que um botão nativo passaria a usar.
 *
 * A descrição entra aqui como VALOR de um atributo, não como marcação: o Next
 * escapa o conteúdo das meta tags, e o resumo já vem sem quebras de linha nem
 * caracteres de controlo (ver `normalizeDescription`). Um cabeçalho HTTP ou uma
 * meta tag com um `\n` lá dentro é que seria um problema — e não pode chegar cá
 * um.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) return { title: "Evento" };

  const summary = summarizeDescription(event.description, SHARE_SUMMARY_LENGTH);

  return {
    title: event.title,
    // Sem descrição escrita não se inventa uma: uma meta tag vazia é melhor do
    // que uma frase gerada que promete o que a página não diz.
    ...(summary ? { description: summary } : {}),
    openGraph: {
      title: event.title,
      ...(summary ? { description: summary } : {}),
      type: "video.other",
    },
  };
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

  // A marca desta página é a do canal DO EVENTO — antes era sempre a do canal
  // por defeito, o que com duas ligas punha a batalha de uma debaixo do nome
  // e da cor da outra.
  const [user, channel] = await Promise.all([requireUser(), getChannelById(event.channelId)]);
  const entitled = user ? await hasActiveEntitlement(user.id, eventId) : false;
  const isLive = event.status === "live";

  // Texto informativo do bilhete (opção A da secção 6) — só é preciso quando o
  // evento vende bilhetes. `bilhete` está sempre no histórico, mas guardamos o
  // resultado para o JSX não o pedir duas vezes.
  const ticketConsent = event.ticketPriceCents != null ? copiaCliente("bilhete") : null;

  return (
    <ViewerShell active="inicio" channel={channel ?? undefined} backoffice={<BackofficeLink />}>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-4 md:pt-6">
        {channel ? (
          <Link
            href={channelPath(channel)}
            className="alvo-toque w-fit text-2sm font-medium text-muted-foreground hover:text-foreground"
          >
            ‹ {channel.name}
          </Link>
        ) : null}

        <PosterPlaceholder className="mt-3 aspect-video rounded-sm" />

        <div className="mt-4 flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{formatDateTime(event.startsAt)}</Badge>
            {isLive && <LiveBadge />}
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-display text-balance md:text-3xl">
            {event.title}
          </h1>

          {/*
           * A descrição, como a liga a escreveu.
           *
           * `{event.description}` é um filho de TEXTO: o React escapa-o, por
           * isso um `<script>` escrito no backoffice sai como as nove letras
           * que são. Não há `dangerouslySetInnerHTML` aqui — e a tentação de o
           * pôr, para converter `\n` em `<br>`, resolve-se com
           * `whitespace-pre-line`, que desenha as quebras sem nenhum HTML pelo
           * meio. Ver a nota longa em lib/event-rules.ts.
           */}
          {event.description ? (
            <p className="text-2sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {event.description}
            </p>
          ) : null}

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

          {event.ticketPriceCents != null && ticketConsent && (
            <TicketPurchaseCard
              eventId={eventId}
              priceCents={event.ticketPriceCents}
              consent={ticketConsent}
            />
          )}

          <HowItWorksCard title="Como funciona o acesso" lines={ACCESS_LINES} />
        </div>
      </div>
      <ViewerFooter />
    </ViewerShell>
  );
}
