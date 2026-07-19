import { NextResponse } from "next/server";
import { defaultChannel } from "@/lib/channels";
import { sendReceiptEmail } from "@/lib/email";
import {
  confirmPaid,
  type PaymentNotification,
  parseWebhook1,
  parseWebhook2,
  verifyWebhook1Key,
  verifyWebhookSignature,
} from "@/lib/eupago";
import { activateEntitlement } from "@/server/entitlements";
import { issueTicket, refundTicket } from "@/server/tickets";

/*
 * Webhook de pagamento da Eupago. Aceita as duas gerações (ver lib/eupago.ts):
 *
 *   GET  → Webhooks 1.0, o único com auto-serviço no backoffice. Query string,
 *          sem assinatura, só dispara em pagamento.
 *   POST → Webhooks 2.0, assinado, com todos os estados. Pede-se ao suporte.
 *
 * Cada método só trata da sua autenticação; o que acontece a seguir é o mesmo
 * para os dois e vive em `fulfil()`.
 *
 * A Eupago repete a notificação até receber 200 (de 2 em 2 minutos, 3 vezes;
 * depois de hora a hora durante 24h). Devolvemos 200 sempre que a mensagem foi
 * entendida — mesmo quando não há nada a fazer — para não a pôr a repetir sem
 * fim. Só um problema nosso é que devolve erro, e aí queremos mesmo a repetição.
 */

async function fulfil(payment: PaymentNotification): Promise<void> {
  const eBilhete = payment.identifier.startsWith("tkt_");

  if (payment.status === "Refund") {
    if (eBilhete) await refundTicket(payment.identifier);
    return;
  }

  if (payment.status !== "Paid") return;

  // A notificação diz que pagaram; quem confirma é a API da Eupago. Sem isto,
  // o 1.0 (que não é assinado) dava acesso a quem descobrisse o URL.
  if (!(await confirmPaid(payment.reference))) {
    console.warn(`[eupago] ${payment.identifier} não confirmado — nada emitido.`);
    return;
  }

  // O prefixo do identifier distingue bilhetes físicos ("tkt_") de acessos PPV
  // (uuid puro). Ambos devolvem o recibo só na 1ª confirmação (a transição de
  // estado é que devolve os dados), por isso uma repetição não reenvia email.
  const receipt = eBilhete
    ? await issueTicket(payment.identifier, payment.reference)
    : await activateEntitlement(payment.identifier, payment.reference);
  if (!receipt) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  await sendReceiptEmail({
    nome: receipt.nome ?? undefined,
    eventoTitulo: receipt.eventoTitulo,
    canalNome: defaultChannel.name,
    eventoData: receipt.eventoData,
    valorCents: receipt.valorCents,
    numeroRecibo: payment.reference || undefined,
    emailConta: receipt.emailConta,
    urlEvento: `${appUrl}/eventos/${receipt.eventId}`,
  });
}

/**
 * Webhooks 1.0 — GET com os campos na query string, **desligado por defeito**.
 *
 * O 2.0 é auto-serviço no backoffice, por isso não há razão para manter aberto
 * um endpoint de dinheiro que ninguém assina: quem descobrisse o URL forjava
 * uma confirmação. Fica aqui como rede de segurança, atrás de
 * `EUPAGO_WEBHOOK_LEGACY=1`, para o caso de o 2.0 dar problemas num evento a
 * decorrer — mas ligá-lo é uma decisão consciente, não o estado normal.
 */
export async function GET(req: Request) {
  if (process.env.EUPAGO_WEBHOOK_LEGACY !== "1") {
    return NextResponse.json({ error: "Webhook 1.0 desativado" }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  if (!verifyWebhook1Key(searchParams.get("chave_api"))) {
    return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  }

  const payment = parseWebhook1(searchParams);
  if (!payment) {
    return NextResponse.json({ error: "Notificação sem identificador" }, { status: 400 });
  }

  await fulfil(payment);
  return NextResponse.json({ ok: true });
}

/** Webhooks 2.0 — POST em JSON assinado; o corpo pode vir encriptado. */
export async function POST(req: Request) {
  const raw = await req.text();

  if (!verifyWebhookSignature(raw, req.headers.get("x-signature"))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const payment = parseWebhook2(raw, req.headers.get("x-initialization-vector"));
  if (!payment) {
    return NextResponse.json({ error: "Corpo não reconhecido" }, { status: 400 });
  }

  await fulfil(payment);
  return NextResponse.json({ ok: true });
}
