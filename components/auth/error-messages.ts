/*
 * Erros do Better Auth → frases humanas PT-PT (regra do design: os erros
 * assumem a culpa e dizem o que fazer; nada de códigos nem inglês no ecrã).
 */

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou password errados.",
  USER_NOT_FOUND: "Email ou password errados.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este email. Experimenta entrar.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este email. Experimenta entrar.",
  PASSWORD_TOO_SHORT: "A password precisa de pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "Essa password é demasiado longa.",
  INVALID_EMAIL: "Esse email não parece válido.",
  EMAIL_NOT_VERIFIED: "Esta conta ainda não confirmou o email.",
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
  return known ?? fallback;
}
