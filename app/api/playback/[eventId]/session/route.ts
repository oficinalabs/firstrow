import { NextResponse } from "next/server";
import { signPlaybackToken, streamIframeUrl } from "@/lib/cloudflare";
import { limitByIp } from "@/lib/rate-limit";
import { requireApi } from "@/server/api-guard";
import { canWatchEvent, playbackTarget } from "@/server/event-access";
import { getEvent } from "@/server/events";
import { startSession } from "@/server/playback";

/*
 * MINT DO TOKEN DE REPRODUÇÃO — a rota que transforma "comprei" em "vejo".
 *
 * A autorização é a posse do direito (ter comprado) OU operar o canal DESTE
 * evento — quem organiza a liga tem de conseguir rever a própria transmissão
 * sem a comprar. O papel é sempre verificado contra o canal do evento: o dono
 * da liga A não vê de graça o conteúdo pago da liga B.
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
  if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  /*
   * QUAL vídeo, antes de assinar seja o que for. A gravação e o direto são
   * recursos diferentes na Cloudflare e o token é assinado para um deles (vai
   * no `sub`). Isto assinava sempre o live input — e por isso nenhuma gravação
   * tocava, nem para quem tinha pago.
   */
  const target = playbackTarget(event);
  if (!target) {
    return NextResponse.json({ error: "Este evento ainda não tem vídeo" }, { status: 404 });
  }

  if (!(await canWatchEvent(gate.user, event))) {
    return NextResponse.json({ error: "Sem acesso a este evento" }, { status: 403 });
  }

  // Concorrência: inicia a sessão (revoga outras da conta) e assina o token.
  const sessionId = await startSession(gate.user.id, eventId);
  const token = await signPlaybackToken(target.id);

  return NextResponse.json({ sessionId, iframeUrl: streamIframeUrl(token) });
}
