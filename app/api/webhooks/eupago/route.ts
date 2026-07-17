import { NextResponse } from "next/server";
import { type EupagoWebhookPayload, verifyWebhookSignature } from "@/lib/eupago";
import { activateEntitlement } from "@/server/entitlements";
import { issueTicket, refundTicket } from "@/server/tickets";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as EupagoWebhookPayload;

  // Só ativamos o acesso quando o pagamento é confirmado. O prefixo do
  // identifier distingue bilhetes físicos ("tkt_") de entitlements (uuid puro).
  if (payload.status === "Paid" && payload.identifier) {
    if (payload.identifier.startsWith("tkt_")) {
      await issueTicket(payload.identifier, String(payload.reference ?? ""));
    } else {
      await activateEntitlement(payload.identifier, String(payload.reference ?? ""));
    }
  }

  if (payload.status === "Refund" && payload.identifier?.startsWith("tkt_")) {
    await refundTicket(payload.identifier);
  }

  return NextResponse.json({ ok: true });
}
