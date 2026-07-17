import { PriceTag } from "@/components/eventos/price-tag";
import type { EventRow } from "@/components/eventos/program";
import { Card } from "@/components/ui/card";

// Cartão de compra da página de evento. `ticketSlot` é o encaixe para o CTA de
// bilhete físico (Frente D) — fica ausente enquanto essa frente não integrar.
export function PurchaseCard({
  event,
  cta,
  microcopy,
  ticketSlot,
}: {
  event: EventRow;
  cta: React.ReactNode;
  microcopy: string;
  ticketSlot?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3 border-b py-2.5 first:pt-0">
        <CheckMark />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Acesso à live</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Em direto + replay durante 48h</div>
        </div>
        <PriceTag cents={event.priceCents} className="text-sm" />
      </div>

      {ticketSlot}

      <div className="flex items-center justify-between border-t py-3">
        <span className="text-sm font-semibold">Total</span>
        <PriceTag cents={event.priceCents} className="text-base font-semibold" />
      </div>

      {cta}

      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{microcopy}</p>
    </Card>
  );
}

function CheckMark() {
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-xs bg-primary text-primary-foreground">
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <polyline
          points="5,12.5 10,17.5 19,7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
