import { TicketCta } from "@/components/tickets/ticket-cta";
import { Card } from "@/components/ui/card";
import { formatEuro } from "@/lib/format";

/*
 * Bloco de compra do bilhete físico na página de evento — separado do acesso à
 * live (é outra compra, outro pagamento MB WAY). A página monta-o só quando o
 * evento vende bilhetes (event.ticketPriceCents != null), a seguir ao cartão de
 * acesso da Frente B.
 */
export function TicketPurchaseCard({
  eventId,
  priceCents,
}: {
  eventId: string;
  priceCents: number;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <QrGlyph />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Bilhete à porta</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Entrada no evento presencial — QR único na tua conta, validado à porta.
          </div>
        </div>
        <span className="whitespace-nowrap font-mono text-sm font-medium">
          {formatEuro(priceCents)}
        </span>
      </div>
      <TicketCta eventId={eventId} priceCents={priceCents} />
    </Card>
  );
}

function QrGlyph() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-xs bg-primary text-primary-foreground"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 3h8v8H3V3Zm2 2v4h4V5H5Z" />
        <path d="M13 3h8v8h-8V3Zm2 2v4h4V5h-4Z" />
        <path d="M3 13h8v8H3v-8Zm2 2v4h4v-4H5Z" />
        <path d="M13 13h3v3h-3v-3Zm5 0h3v3h-3v-3Zm-5 5h3v3h-3v-3Zm5 0h3v3h-3v-3Z" />
      </svg>
    </span>
  );
}
