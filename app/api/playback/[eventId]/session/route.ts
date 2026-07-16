import { NextResponse } from "next/server";
import { signPlaybackToken, streamIframeUrl } from "@/lib/cloudflare";
import { requireUser } from "@/server/auth-helper";
import { hasActiveEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";
import { startSession } from "@/server/playback";

export async function POST(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const event = await getEvent(eventId);
  if (!event?.cfLiveInputId) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  }

  if (!(await hasActiveEntitlement(user.id, eventId))) {
    return NextResponse.json({ error: "Sem acesso a este evento" }, { status: 403 });
  }

  // Concorrência: inicia a sessão (revoga outras da conta) e assina o token.
  const sessionId = await startSession(user.id, eventId);
  const token = await signPlaybackToken(event.cfLiveInputId);

  return NextResponse.json({ sessionId, iframeUrl: streamIframeUrl(token) });
}
