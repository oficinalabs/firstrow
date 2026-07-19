import { NextResponse } from "next/server";
import { defaultChannel } from "@/lib/channels";
import { sendReceiptEmail } from "@/lib/email";
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
  // A ativação devolve o recibo só na 1ª confirmação (idempotente) → email 1x.
  if (payload.status === "Paid" && payload.identifier) {
    const ref = String(payload.reference ?? "");
    const receipt = payload.identifier.startsWith("tkt_")
      ? await issueTicket(payload.identifier, ref)
      : await activateEntitlement(payload.identifier, ref);

    if (receipt) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await sendReceiptEmail({
        nome: receipt.nome ?? undefined,
        eventoTitulo: receipt.eventoTitulo,
        canalNome: defaultChannel.name,
        eventoData: receipt.eventoData,
        valorCents: receipt.valorCents,
        numeroRecibo: ref || undefined,
        emailConta: receipt.emailConta,
        urlEvento: `${appUrl}/eventos/${receipt.eventId}`,
      });
    }
  }

  if (payload.status === "Refund" && payload.identifier?.startsWith("tkt_")) {
    await refundTicket(payload.identifier);
  }

  return NextResponse.json({ ok: true });
}
