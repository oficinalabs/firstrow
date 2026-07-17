import { createElement, type ReactElement } from "react";
import { Resend } from "resend";
import Recibo, { type ReciboProps } from "@/emails/recibo";
import VaiComecar, { type VaiComecarProps } from "@/emails/vai-comecar";
import { formatTime } from "@/lib/format";

/*
 * Envio de emails transacionais (Resend + React Email).
 *
 * Sem RESEND_API_KEY o envio é um no-op silencioso (só console.warn) — nunca
 * lança, para não partir o build nem o runtime em ambientes sem credencial.
 *
 * NOTA DE INTEGRAÇÃO (fora desta frente): ligar `sendReceiptEmail` ao webhook
 * do Eupago (app/api/webhooks/eupago) depois de ativar o entitlement/bilhete, e
 * `sendEventStartingEmail` a um job ~1h antes do evento (scheduler ainda por
 * decidir). Variáveis necessárias: RESEND_API_KEY e (opcional) EMAIL_FROM.
 */

const FROM = process.env.EMAIL_FROM ?? "FirstRow <no-reply@joinfirstrow.com>";

let client: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export type SendResult = { sent: boolean; id?: string; error?: string };

async function send(to: string, subject: string, react: ReactElement): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY em falta — email não enviado (no-op).");
    return { sent: false };
  }
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, react });
    if (error) {
      console.warn(`[email] Falha ao enviar "${subject}": ${error.message}`);
      return { sent: false, error: error.message };
    }
    return { sent: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[email] Erro inesperado ao enviar "${subject}": ${message}`);
    return { sent: false, error: message };
  }
}

/** Recibo de compra (MB WAY). Enviado para o email da conta compradora. */
export function sendReceiptEmail(params: ReciboProps): Promise<SendResult> {
  return send(params.emailConta, `Recibo — ${params.eventoTitulo}`, createElement(Recibo, params));
}

/** Lembrete "vai começar" (~1h antes). `to` = email do espectador. */
export function sendEventStartingEmail(
  params: VaiComecarProps & { to: string },
): Promise<SendResult> {
  const { to, ...emailProps } = params;
  return send(
    to,
    `${emailProps.eventoTitulo} — começa às ${formatTime(emailProps.comecaAs)}`,
    createElement(VaiComecar, emailProps),
  );
}
