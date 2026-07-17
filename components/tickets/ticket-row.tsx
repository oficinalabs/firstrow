import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatTime } from "@/lib/format";

/** Linha de bilhete passado/usado — tudo em tom apagado, o QR já não interessa. */
export function TicketRow({
  titulo,
  startsAt,
  usedAt,
}: {
  titulo: string;
  startsAt: Date;
  usedAt: Date | null;
}) {
  const [dia, mes] = formatDate(startsAt).split(" ");
  return (
    <Card className="flex items-center gap-3.5 px-4 py-3">
      <div className="w-9 shrink-0 text-center">
        <p className="font-mono text-base font-semibold text-muted-foreground">{dia}</p>
        <p className="font-mono text-2xs uppercase text-muted-foreground">{mes}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-2sm font-semibold text-muted-foreground">{titulo}</p>
        {usedAt ? (
          <p className="text-xs text-muted-foreground">usado às {formatTime(usedAt)}</p>
        ) : null}
      </div>
      <Badge variant="muted">Usado</Badge>
    </Card>
  );
}
