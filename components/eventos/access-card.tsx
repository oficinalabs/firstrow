import Link from "next/link";
import { PriceTag } from "@/components/eventos/price-tag";
import type { EventRow } from "@/components/eventos/program";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatEuro } from "@/lib/format";

// Secção de acesso/preços do canal. Sem tiers de subscrição na Fase 0
// (recorrência MB WAY por confirmar) — mostra o PPV das próximas lives.
export function AccessCard({ upcoming }: { upcoming: EventRow[] }) {
  const next = upcoming[0];
  if (!next) return null;

  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <h3 className="font-display text-base font-bold">Acesso às lives</h3>
      <div>
        {upcoming.slice(0, 3).map((event) => (
          <div
            key={event.id}
            className="flex items-baseline justify-between gap-3 border-b py-2.5 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{event.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(event.startsAt)}
              </div>
            </div>
            <PriceTag cents={event.priceCents} className="shrink-0 text-sm" />
          </div>
        ))}
      </div>
      <Link href={`/eventos/${next.id}`} className={buttonVariants({ size: "lg" })}>
        Comprar acesso · {formatEuro(next.priceCents)}
      </Link>
      <p className="text-xs leading-relaxed text-foreground-secondary">
        Pagamento único por MB WAY — sem subscrição. O acesso inclui o direto e o replay.
      </p>
    </Card>
  );
}
