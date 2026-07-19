import { NextResponse } from "next/server";
import { requireApi } from "@/server/api-guard";
import { canManageEvents } from "@/server/authz";
import { createEvent } from "@/server/events";

// Criar eventos é gerir a liga (e o dinheiro dela) → canManageEvents.
export async function POST(req: Request) {
  const gate = await requireApi(canManageEvents);
  if (!gate.ok) return gate.response;

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
