import { Badge } from "@/components/ui/badge";
import { LiveBadge } from "@/components/ui/live-badge";

// Estado do evento (events.status) → etiqueta. Usado na lista de eventos,
// no dashboard e na transmissão — um único sítio para o mapeamento.
export function EventStatusBadge({ status }: { status: string }) {
  if (status === "live") return <LiveBadge>Ao vivo</LiveBadge>;
  if (status === "ended") return <Badge variant="outline">Terminado</Badge>;
  return <Badge variant="muted">Rascunho</Badge>;
}
