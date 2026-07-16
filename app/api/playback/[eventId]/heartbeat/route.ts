import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-helper";
import { heartbeat } from "@/server/playback";

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ active: false }, { status: 401 });

  const body = (await req.json()) as { sessionId?: string };
  if (!body.sessionId) return NextResponse.json({ active: false }, { status: 400 });

  const active = await heartbeat(body.sessionId, user.id);
  return NextResponse.json({ active });
}
