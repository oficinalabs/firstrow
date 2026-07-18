/*
 * Erros do Better Auth → frases humanas PT-PT (regra do design: os erros
 * assumem a culpa e dizem o que fazer; nada de códigos nem inglês no ecrã).
 */

import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou password errados.",
  USER_NOT_FOUND: "Email ou password errados.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este email. Experimenta entrar.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este email. Experimenta entrar.",
  PASSWORD_TOO_SHORT: `A password precisa de pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  PASSWORD_TOO_LONG: "Essa password é demasiado longa.",
  INVALID_EMAIL: "Esse email não parece válido.",
  EMAIL_NOT_VERIFIED: "Falta confirmar o email desta conta.",
  EMAIL_ALREADY_VERIFIED: "Este email já está confirmado. Podes entrar.",
  INVALID_TOKEN: "Este link já não serve. Pede um novo.",
  TOKEN_EXPIRED: "Este link expirou. Pede um novo.",
  TOO_MANY_REQUESTS: "Demasiados pedidos seguidos. Espera um minuto e tenta outra vez.",
};

/**
 * Erros que chegam no URL (?error=) depois de um salto pelo Google ou pelo
 * link do email — vêm em minúsculas com underscore (OAuth) ou em MAIÚSCULAS
 * (tokens do Better Auth).
 */
const REDIRECT_MESSAGES: Record<string, string> = {
  account_not_linked:
    "Já existe uma conta com esse email, criada com password. Entra com a password e confirma o email — a partir daí o Google fica ligado a essa conta.",
  signup_disabled: "Não é possível criar contas com o Google neste momento.",
  unable_to_create_user: "Não conseguimos criar a conta a partir do Google. Tenta com email.",
  unable_to_link_account: "Não conseguimos ligar a tua conta Google. Tenta outra vez.",
  invalid_state: "O pedido ao Google expirou a meio. Tenta outra vez.",
  state_not_found: "O pedido ao Google expirou a meio. Tenta outra vez.",
  please_restart_the_process: "O pedido ao Google expirou a meio. Tenta outra vez.",
};

export type AuthClientError = {
  code?: string;
  message?: string;
  status?: number;
};

export function humanAuthError(
  error: AuthClientError | null | undefined,
  fallback: string,
): string {
  const known = error?.code ? MESSAGES[error.code] : undefined;
  if (known) return known;
  // A política de password devolve a frase já escrita em português (diz a
  // regra que falta) — nesse caso a mensagem do servidor é a melhor que temos.
  if (error?.code === "PASSWORD_POLICY" && error.message) return error.message;
  return fallback;
}

/** Traduz um `?error=` de redirect. Devolve `null` quando não há erro. */
export function humanRedirectError(value: string | string[] | undefined): string | null {
  const code = Array.isArray(value) ? value[0] : value;
  if (!code) return null;
  return (
    REDIRECT_MESSAGES[code] ??
    MESSAGES[code] ??
    "Não conseguimos concluir a operação. Tenta outra vez."
  );
}
