import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { limitByIp } from "@/lib/rate-limit";

/*
 * ============================================================================
 *  O travão à porta do Better Auth
 * ============================================================================
 *
 * A Frente A já pôs limites dentro da config do Better Auth (`rateLimit`).
 * Este é o mesmo travão vindo de fora, pela via partilhada de `lib/rate-limit.ts`
 * — para haver UM sítio onde se vê e afina a postura da app inteira, em vez de
 * dois sistemas com números diferentes que ninguém sabe qual manda.
 *
 * Os dois somam-se sem conflito: quem passar por este ainda apanha o de dentro.
 *
 * POR IP, NÃO POR EMAIL: travar por conta deixava um atacante trancar a conta
 * de outra pessoa à vontade — o limite viraria a arma (lockout-as-DoS). O IP
 * é quem paga a fatura do que está a tentar. (OWASP Authentication Cheat Sheet.)
 *
 * NÃO TOCA NO GET: os callbacks do OAuth do Google e a leitura de sessão
 * passam por aqui e travá-los partia o login em vez de o proteger.
 */

const handler = toNextJsHandler(auth);

/** Caminhos do Better Auth que se podem martelar, e com que balde. */
const GUARDED: ReadonlyArray<{ suffix: string; scope: "auth" | "authEmail" }> = [
  // Adivinhar credenciais.
  { suffix: "/sign-in/email", scope: "auth" },
  { suffix: "/sign-up/email", scope: "auth" },
  { suffix: "/reset-password", scope: "auth" },
  { suffix: "/change-password", scope: "auth" },
  // Disparam email para terceiros → mais apertado, senão é um canhão de spam.
  { suffix: "/request-password-reset", scope: "authEmail" },
  { suffix: "/forget-password", scope: "authEmail" },
  { suffix: "/send-verification-email", scope: "authEmail" },
];

export const GET = handler.GET;

export async function POST(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const guarded = GUARDED.find((entry) => pathname.endsWith(entry.suffix));

  if (guarded) {
    // O balde inclui o caminho: gastar as tentativas de login não deve
    // impedir a pessoa de pedir um email de recuperação.
    const limited = limitByIp(req, guarded.scope, guarded.suffix);
    if (limited) return limited;
  }

  return handler.POST(req);
}
