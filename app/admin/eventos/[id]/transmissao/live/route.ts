import { NextResponse } from "next/server";
import { requireApi } from "@/server/api-guard";
import { canOperateEvents } from "@/server/authz";
import { countActiveViewers, listBlockedSessionsToday } from "@/server/stats";

// Polling (10s) da página de transmissão: espectadores ativos + bloqueadas
// hoje. Quem opera a transmissão precisa de ver isto → canOperateEvents.
// Gate próprio — route handlers não herdam a proteção do layout.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireApi(canOperateEvents);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const [viewers, blocked] = await Promise.all([
    countActiveViewers(id),
    listBlockedSessionsToday(id),
  ]);
  return NextResponse.json({ viewers, blockedToday: blocked.total });
}
