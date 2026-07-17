const DEFAULT_DESTINATION = "/conta";

/**
 * Valida um caminho de destino. Só aceita caminhos internos relativos
 * ("/eventos/x"); "//host", "\" ou esquemas ("https:") caem no destino por
 * defeito — evita open redirect.
 */
export function sanitizeRedirect(
  value: string | string[] | undefined,
  fallback = DEFAULT_DESTINATION,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes(":")) {
    return fallback;
  }
  return raw;
}

/**
 * Destino de volta a partir dos search params. Convenção partilhada do repo:
 * `next` (usada pela superfície do espectador — checkout/player). Aceitamos
 * `redirect` como alias defensivo para não partir links de outras frentes.
 */
export function resolveNext(
  params: { next?: string | string[]; redirect?: string | string[] },
  fallback = DEFAULT_DESTINATION,
): string {
  return sanitizeRedirect(params.next ?? params.redirect, fallback);
}

/** Href de um ecrã de auth que preserva o destino de volta (se não for o default). */
export function withNext(path: string, next: string): string {
  if (next === DEFAULT_DESTINATION) return path;
  return `${path}?next=${encodeURIComponent(next)}`;
}
