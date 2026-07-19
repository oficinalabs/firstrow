import { NextResponse } from "next/server";
import { signPlaybackToken, streamIframeUrl } from "@/lib/cloudflare";
import { limitByIp } from "@/lib/rate-limit";
import { requireApi } from "@/server/api-guard";
import { hasActiveEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";
import { startSession } from "@/server/playback";

/*
 * MINT DO TOKEN DE REPRODUÇÃO — a rota que transforma "comprei" em "vejo".
 *
 * A autorização aqui NÃO é um papel, é a posse do direito: `hasActiveEntitlement`.
 * Um platform_admin sem bilhete também não passa, e é isso que se quer — o
 * token é assinado para um vídeo concreto e quem o tiver, vê.
 *
 * Limite por conta: cada `POST` assina um token novo, e um token é acesso.
 * Sem travão, uma conta comprada uma vez podia servir de fábrica de tokens
 * para distribuir. 12/min dá para recarregar a página à vontade e não dá
 * para alimentar uma audiência.
 */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  const limited = limitByIp(req, "playback", gate.user.id);
  if (limited) return limited;

  const event = await getEvent(eventId);
  if (!event?.cfLiveInputId) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  }

  if (!(await hasActiveEntitlement(gate.user.id, eventId))) {
    return NextResponse.json({ error: "Sem acesso a este evento" }, { status: 403 });
  }

  // Concorrência: inicia a sessão (revoga outras da conta) e assina o token.
  const sessionId = await startSession(gate.user.id, eventId);
  const token = await signPlaybackToken(event.cfLiveInputId);

  return NextResponse.json({ sessionId, iframeUrl: streamIframeUrl(token) });
}
