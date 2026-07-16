import { NextResponse } from "next/server";
import { createSplitMbwayPayment } from "@/lib/eupago";
import { buildSplit } from "@/lib/split";
import { requireUser } from "@/server/auth-helper";
import { createPendingEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  const body = (await req.json()) as { phone?: string };
  if (!body.phone) return NextResponse.json({ error: "Telemóvel em falta" }, { status: 400 });

  // Cria o entitlement pendente; o id serve de `identifier` na Eupago para o webhook o ativar.
  const entitlement = await createPendingEntitlement(user.id, eventId);
  const amountEur = event.priceCents / 100;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const payment = await createSplitMbwayPayment({
    amountEur,
    phone: body.phone,
    identifier: entitlement.id,
    beneficiaries: buildSplit(amountEur),
    callbackUrl: `${appUrl}/api/webhooks/eupago`,
  });

  return NextResponse.json({ ok: true, payment });
}
