import type { CSSProperties } from "react";

/*
 * Tokens dos EMAILS — espelham os tokens light de app/globals.css.
 * Os clientes de email não suportam CSS custom properties de forma fiável,
 * por isso os valores vivem aqui como constantes. Regra: se mudares a paleta
 * ou a tipografia em globals.css, muda também aqui. Este é o ÚNICO sítio com
 * cores/tamanhos hex/px do lado dos emails.
 */

const color = {
  page: "#f6f5f1", // --background (espelho; o email usa `surface` à volta do cartão)
  surface: "#eceae3", // --muted → fundo à volta do cartão
  card: "#ffffff", // --field → cartão do email (branco puro, como no design)
  foreground: "#161512", // --foreground (tinta)
  mutedForeground: "#6e6a61", // --muted-foreground (texto 2º)
  border: "#dfdcd4", // --border (hairline)
  divider: "#eceae3", // --muted (linha interna)
  bar: "#0f0e0c", // --bar (barra FirstRow)
  barForeground: "#f1efea", // --bar-foreground
  accent: "#eae04a", // --accent (limão)
  primary: "#161512", // --primary (ação)
  primaryForeground: "#f6f5f1", // --primary-foreground
} as const;

// Stacks tipográficos: mesmas famílias de globals.css, com fallbacks de sistema
// (webfonts não são fiáveis em email).
const font = {
  display: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  sans: "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

const radius = 6; // --radius (6px)

const text = {
  wordmark: {
    margin: 0,
    fontFamily: font.display,
    fontWeight: 700,
    fontSize: 15,
    color: color.barForeground,
  },
  heading: {
    margin: 0,
    fontFamily: font.display,
    fontWeight: 800,
    fontSize: 22,
    lineHeight: 1.2,
    color: color.foreground,
  },
  headingLg: {
    margin: 0,
    fontFamily: font.display,
    fontWeight: 800,
    fontSize: 24,
    lineHeight: 1.15,
    color: color.foreground,
  },
  body: {
    margin: 0,
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 1.6,
    color: color.mutedForeground,
  },
  eyebrow: {
    margin: 0,
    fontFamily: font.mono,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: color.mutedForeground,
  },
  itemTitle: {
    margin: 0,
    fontFamily: font.sans,
    fontWeight: 600,
    fontSize: 14,
    color: color.foreground,
  },
  itemSub: { margin: "2px 0 0", fontFamily: font.sans, fontSize: 12, color: color.mutedForeground },
  price: {
    margin: 0,
    fontFamily: font.mono,
    fontWeight: 500,
    fontSize: 13,
    color: color.foreground,
    whiteSpace: "nowrap",
  },
  totalLabel: {
    margin: 0,
    fontFamily: font.sans,
    fontWeight: 600,
    fontSize: 14,
    color: color.foreground,
  },
  totalValue: {
    margin: 0,
    fontFamily: font.mono,
    fontWeight: 600,
    fontSize: 14,
    color: color.foreground,
    whiteSpace: "nowrap",
  },
  meta: { margin: 0, fontFamily: font.mono, fontSize: 11.5, color: color.mutedForeground },
  note: {
    margin: 0,
    fontFamily: font.sans,
    fontSize: 12,
    lineHeight: 1.6,
    color: color.mutedForeground,
  },
  footer: { margin: 0, fontFamily: font.mono, fontSize: 10.5, color: color.mutedForeground },
} satisfies Record<string, CSSProperties>;

const surface = {
  body: {
    margin: 0,
    backgroundColor: color.surface,
    color: color.foreground,
    fontFamily: font.sans,
  },
  card: {
    backgroundColor: color.card,
    border: `1px solid ${color.border}`,
    borderRadius: radius,
    overflow: "hidden",
  },
  bar: { backgroundColor: color.bar, padding: "16px 24px" },
  content: { padding: "28px 24px" },
  footer: { borderTop: `2px solid ${color.accent}`, padding: "12px 24px" },
  detailBox: { border: `1px solid ${color.border}`, borderRadius: radius, marginTop: 18 },
  detailRow: { padding: "12px 16px", borderBottom: `1px solid ${color.divider}` },
  detailRowLast: { padding: "12px 16px" },
  button: {
    backgroundColor: color.primary,
    color: color.primaryForeground,
    borderRadius: radius,
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
    padding: "14px 20px",
    fontFamily: font.sans,
    fontWeight: 600,
    fontSize: 14.5,
    textDecoration: "none",
  },
} satisfies Record<string, CSSProperties>;

export const email = { color, font, radius, text, surface };
