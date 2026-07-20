import { NextResponse } from "next/server";
import { CHAT_TIMEOUT_MINUTES, muteUser, openChat } from "@/server/chat";

/*
 * Silenciar uma conta NESTE evento. A outra metade da moderação mínima.
 *
 * Por evento, e não por canal nem global: o castigo fica onde a coisa aconteceu.
 * `muteUser` recusa silenciar quem também opera o canal — e recusa o próprio.
 */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const access = await openChat(eventId);
  if (!access.ok) {
    return access.reason === "anonymous"
      ? NextResponse.json({ error: "Precisas de iniciar sessão." }, { status: 401 })
      : NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  }

  const payload = await req.json().catch(() => null);
  const alvo = (payload as { userId?: unknown } | null)?.userId;
  if (typeof alvo !== "string" || !alvo) {
    return NextResponse.json({ error: "Falta a conta a silenciar." }, { status: 400 });
  }

  const resultado = await muteUser(access, alvo, CHAT_TIMEOUT_MINUTES);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }

  return NextResponse.json({ ok: true, minutos: CHAT_TIMEOUT_MINUTES });
}
