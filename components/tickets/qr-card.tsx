import { QrSvg } from "@/components/tickets/qr-svg";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatEuro } from "@/lib/format";

/*
 * Bilhete pensado para a porta: QR enorme, alto contraste, funciona por
 * screenshot. Fundo branco fixo (mesmo em dark) — o QR não negoceia contraste.
 */
export function QrCard({
  qrToken,
  codigo,
  titulo,
  startsAt,
  nome,
  priceCents,
}: {
  qrToken: string;
  codigo: string;
  titulo: string;
  startsAt: Date;
  nome: string;
  priceCents: number;
}) {
  return (
    <article className="overflow-hidden rounded-sm border-2 border-graphite bg-white text-accent-foreground">
      <div aria-hidden className="h-1 bg-accent" />
      <div className="flex items-start justify-between gap-3 px-4.5 pt-4 pb-2">
        <div>
          <h2 className="font-display text-lg leading-tight font-extrabold">{titulo}</h2>
          <p className="mt-1.5 font-mono text-2xs font-medium uppercase text-graphite">
            {formatDateTime(startsAt)}
          </p>
        </div>
        <Badge variant="outline" className="border-graphite font-bold text-accent-foreground">
          Por usar
        </Badge>
      </div>
      <div className="flex justify-center px-4.5 py-3.5">
        <QrSvg value={qrToken} className="size-66 text-accent-foreground" />
      </div>
      <div className="px-4.5 text-center">
        <p className="font-mono text-xl font-semibold tracking-widest">{codigo}</p>
        <p className="mt-1 text-2sm text-graphite">
          {nome} · 1 × Geral · {formatEuro(priceCents)}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-input px-4.5 py-3">
        <span className="font-mono text-2xs text-graphite">funciona offline — screenshot vale</span>
        <span className="font-mono text-2xs text-graphite">brilho no máximo ↑</span>
      </div>
    </article>
  );
}
