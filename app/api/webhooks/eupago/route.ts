import { NextResponse } from "next/server";
import {
  type PaymentNotification,
  parseWebhook1,
  parseWebhook2,
  verifyWebhook1Key,
  verifyWebhookSignature,
} from "@/lib/eupago";
import { purchaseKindOf, settlePurchase } from "@/server/fulfilment";
import { refundTicket } from "@/server/tickets";

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

/*
 * O que fazer com uma notificação já autenticada.
 *
 * Repare-se no que NÃO está aqui: confirmar o pagamento, transitar o estado e
 * enviar o recibo. Isso vive em `server/fulfilment.ts` porque a reconciliação
 * (`server/reconcile.ts`) faz exatamente o mesmo quando o webhook se perde — e
 * dois caminhos a fazer "quase" o mesmo divergem sem ninguém dar por isso.
 * Daqui para baixo só fica o que é próprio do webhook: os estados que ele traz
 * e que a reconciliação nunca vê.
 */
async function fulfil(payment: PaymentNotification): Promise<void> {
  if (payment.status === "Refund") {
    // Só bilhetes: um acesso PPV reembolsado ainda não tem caminho definido.
    if (purchaseKindOf(payment.identifier) === "ticket") {
      await refundTicket(payment.identifier);
    }
    return;
  }

  if (payment.status !== "Paid") return;

  // A notificação diz que pagaram; quem confirma é a API da Eupago. Sem isto,
  // o 1.0 (que não é assinado) dava acesso a quem descobrisse o URL.
  const resultado = await settlePurchase(payment.identifier, payment.reference);
  if (resultado === "por-pagar") {
    console.warn(`[eupago] ${payment.identifier} não confirmado — nada emitido.`);
  }
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
