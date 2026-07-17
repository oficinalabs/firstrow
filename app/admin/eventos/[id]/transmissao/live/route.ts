import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/server/auth-helper";
import { countActiveViewers, listBlockedSessionsToday } from "@/server/stats";

// Polling (10s) da página de transmissão: espectadores ativos + bloqueadas
// hoje. Gate próprio — route handlers não herdam a proteção do layout.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const [viewers, blocked] = await Promise.all([
    countActiveViewers(id),
    listBlockedSessionsToday(id),
  ]);
  return NextResponse.json({ viewers, blockedToday: blocked.total });
}
