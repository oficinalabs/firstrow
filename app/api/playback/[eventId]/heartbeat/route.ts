import { NextResponse } from "next/server";
import { requireApi } from "@/server/api-guard";
import { heartbeat } from "@/server/playback";

/*
 * O heartbeat é o que corta a sessão antiga quando a conta começa a ver
 * noutro sítio. Sem rate limit de propósito: o player bate de X em X segundos
 * e travá-lo seria travar a própria regra de concorrência.
 *
 * A autorização fina é a posse: `heartbeat()` filtra por `userId`, por isso o
 * id de sessão de outra pessoa devolve `false` em vez de a revogar.
 */
export async function POST(req: Request) {
  const gate = await requireApi();
  if (!gate.ok) return NextResponse.json({ active: false }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { sessionId?: string } | null;
  if (!body?.sessionId) return NextResponse.json({ active: false }, { status: 400 });

  const active = await heartbeat(body.sessionId, gate.user.id);
  return NextResponse.json({ active });
}
