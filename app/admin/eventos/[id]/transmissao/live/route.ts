import { NextResponse } from "next/server";
import { requireApiForEvent } from "@/server/api-guard";
import { canOperateEvents } from "@/server/authz";
import { countActiveViewers, listBlockedSessionsToday } from "@/server/stats";

// Polling (10s) da página de transmissão: espectadores ativos + bloqueadas
// hoje. Quem opera a transmissão precisa de ver isto → canOperateEvents, no
// canal DESTE evento. Gate próprio — route handlers não herdam a proteção do
// layout, e esta rota devolve emails de quem teve a sessão cortada.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const gate = await requireApiForEvent(id, canOperateEvents);
  if (!gate.ok) return gate.response;

  const [viewers, blocked] = await Promise.all([
    countActiveViewers(id),
    listBlockedSessionsToday(id),
  ]);
  return NextResponse.json({ viewers, blockedToday: blocked.total });
}
