import { NextResponse } from "next/server";
import { type EupagoWebhookPayload, verifyWebhookSignature } from "@/lib/eupago";
import { activateEntitlement } from "@/server/entitlements";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as EupagoWebhookPayload;

  // Só ativamos o acesso quando o pagamento é confirmado.
  if (payload.status === "Paid" && payload.identifier) {
    await activateEntitlement(payload.identifier, String(payload.reference ?? ""));
  }

  return NextResponse.json({ ok: true });
}
