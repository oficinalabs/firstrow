import { createElement, type ReactElement } from "react";
import { Resend } from "resend";
import Recibo, { type ReciboProps } from "@/emails/recibo";
import RedefinirPassword, { type RedefinirPasswordProps } from "@/emails/redefinir-password";
import VaiComecar, { type VaiComecarProps } from "@/emails/vai-comecar";
import VerificarEmail, { type VerificarEmailProps } from "@/emails/verificar-email";
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

/*
 * O remetente por defeito tem de ser um domínio VERIFICADO no Resend, senão o
 * envio falha do lado deles e nós só vemos silêncio.
 *
 * Estava `joinfirstrow.com` — um domínio que nunca chegou a ser comprado, quanto
 * mais verificado. Como defeito, era uma armadilha: bastava o `EMAIL_FROM` faltar
 * ou vir com uma letra trocada na Vercel para nenhum recibo sair, sem erro
 * visível. O plano gratuito do Resend só permite um domínio e é `arestadigital.pt`.
 */
const FROM = process.env.EMAIL_FROM ?? "FirstRow <no-reply@arestadigital.pt>";

let client: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

/**
 * Há credencial para enviar emails?
 *
 * Isto é a base da HONESTIDADE dos ecrãs de auth: sem `RESEND_API_KEY` nenhum
 * email sai daqui, por isso a UI tem de dizer "o envio ainda não está ativo"
 * em vez de "email a caminho". O endpoint do Better Auth responde sempre
 * `{ status: true }` (é assim que evita revelar que emails existem), logo a
 * verdade sobre o envio só pode vir daqui — do servidor.
 */
export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
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

/** Ativação de conta. `to` = email a confirmar (no registo e nos reenvios). */
export function sendVerificationEmail(
  params: VerificarEmailProps & { to: string },
): Promise<SendResult> {
  const { to, ...emailProps } = params;
  return send(to, "Confirma o teu email — FirstRow", createElement(VerificarEmail, emailProps));
}

/** Link para criar uma nova password (ecrã /recuperar). */
export function sendPasswordResetEmail(
  params: RedefinirPasswordProps & { to: string },
): Promise<SendResult> {
  const { to, ...emailProps } = params;
  return send(
    to,
    "Criar uma nova password — FirstRow",
    createElement(RedefinirPassword, emailProps),
  );
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
