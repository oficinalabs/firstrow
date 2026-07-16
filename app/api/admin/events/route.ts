import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/server/auth-helper";
import { createEvent } from "@/server/events";

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = (await req.json()) as {
    title?: string;
    startsAt?: string;
    priceCents?: number;
  };
  if (!body.title || !body.startsAt || typeof body.priceCents !== "number") {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const result = await createEvent({
    title: body.title,
    startsAt: new Date(body.startsAt),
    priceCents: body.priceCents,
  });
  return NextResponse.json(result);
}
