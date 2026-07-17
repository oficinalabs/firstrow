import Link from "next/link";
import { CountdownTimer } from "@/components/eventos/countdown-timer";
import { PosterPlaceholder } from "@/components/eventos/poster-placeholder";
import type { EventRow } from "@/components/eventos/program";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatEuro } from "@/lib/format";

// Hero do canal: a próxima live com contagem decrescente e compra direta.
// `ticketSlot` fica reservado ao CTA de bilhete físico (Frente D).
export function NextLiveCard({
  event,
  ticketSlot,
}: {
  event: EventRow;
  ticketSlot?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden md:grid md:grid-cols-[400px_1fr]">
      <PosterPlaceholder className="aspect-video md:aspect-auto md:min-h-70" />
      <div className="flex flex-col gap-3.5 p-4 md:gap-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-2xs font-semibold uppercase tracking-label text-(--tenant)">
            Próxima live
          </span>
          <Badge>{formatDateTime(event.startsAt)}</Badge>
        </div>
        <h2 className="font-display text-xl font-extrabold tracking-display md:text-2xl">
          {event.title}
        </h2>
        <CountdownTimer target={event.startsAt} />
        <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
          <Link
            href={`/eventos/${event.id}`}
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Comprar acesso · {formatEuro(event.priceCents)}
          </Link>
          {ticketSlot}
        </div>
        <p className="text-xs leading-relaxed text-foreground-secondary">
          Pagas com MB WAY. Vês em qualquer dispositivo — 1 sessão de cada vez, sem links
          partilháveis.
        </p>
      </div>
    </Card>
  );
}
