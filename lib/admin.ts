// Gate de admin simples via ADMIN_EMAILS (lista separada por vírgulas).
// Fase 2: substituir por papéis no tenant (ver docs/03-BACKEND.md).
export function isAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
