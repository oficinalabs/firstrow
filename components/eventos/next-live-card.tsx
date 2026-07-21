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
    /*
     * A divisão em duas colunas pergunta ao CARTÃO se tem espaço, não à janela.
     *
     * Com `md:` (a janela ≥768px) isto partia-se de forma silenciosa e grave:
     * a 768px o cartão vive na coluna principal do canal, que tem 336px de
     * largura — mais estreita do que a coluna fixa de 400px do cartaz. A
     * segunda coluna era empurrada para x=433, inteiramente fora do cartão, e
     * o `overflow-hidden` do Card cortava-a. Resultado medido no ecrã: o
     * cartão da próxima live mostrava um cartaz vazio e MAIS NADA — sem
     * título, sem data, sem contagem e sem o botão de comprar. Não dava
     * scroll horizontal nem erro de consola; a informação desaparecia e
     * pronto.
     *
     * `@2xl` (42rem = 672px) é o ponto a partir do qual sobram ~272px para o
     * texto depois dos 400px do cartaz. E `minmax(0,400px)` em vez de `400px`
     * é o cinto de segurança: mesmo que um dia o cartão fique entre os dois
     * valores, a coluna encolhe em vez de sair porta fora.
     */
    <Card className="@container overflow-hidden">
      <div className="@2xl:grid @2xl:grid-cols-[minmax(0,400px)_1fr]">
        <PosterPlaceholder className="aspect-video @2xl:aspect-auto @2xl:min-h-70" />
        <div className="flex flex-col gap-3.5 p-4 @2xl:gap-4 @2xl:p-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-2xs font-semibold uppercase tracking-label text-(--tenant)">
              Próxima live
            </span>
            <Badge>{formatDateTime(event.startsAt)}</Badge>
          </div>
          <h2 className="font-display text-xl font-extrabold tracking-display @2xl:text-2xl">
            {event.title}
          </h2>
          <CountdownTimer target={event.startsAt} />
          <div className="flex flex-col gap-2.5 @2xl:flex-row @2xl:items-center">
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
      </div>
    </Card>
  );
}
