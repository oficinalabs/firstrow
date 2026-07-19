import { NextResponse } from "next/server";
import { canOperateEvents, getCurrentUser } from "@/server/authz";
import { countActiveViewers, listBlockedSessionsToday } from "@/server/stats";

// Polling (10s) da página de transmissão: espectadores ativos + bloqueadas
// hoje. Gate próprio — route handlers não herdam a proteção do layout.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sem sessão" }, { status: 401 });
  if (!canOperateEvents(user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const [viewers, blocked] = await Promise.all([
    countActiveViewers(id),
    listBlockedSessionsToday(id),
  ]);
  return NextResponse.json({ viewers, blockedToday: blocked.total });
}
