import { cn } from "@/lib/utils";

/*
 * Caixa de aviso dos ecrãs de auth (design: hairline + fundo a 10%, raio 6px).
 * Um só componente para "email a caminho", "link expirado", "envio inativo" e
 * "conta já existe" — zero copy-paste de JSX entre formulários e páginas.
 */

const TONES = {
  success: "border-success bg-success/10",
  warning: "border-warning bg-warning/10",
  error: "border-destructive bg-destructive/10",
  neutral: "border-border bg-muted/40",
} as const;

export type AuthNoticeTone = keyof typeof TONES;

export function AuthNotice({
  tone = "neutral",
  title,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { tone?: AuthNoticeTone; title: string }) {
  return (
    <div className={cn("rounded-sm border px-4 py-3.5", TONES[tone], className)} {...props}>
      <p className="text-2sm font-semibold text-foreground">{title}</p>
      {children ? (
        <div className="mt-1 text-2sm leading-relaxed text-foreground-secondary">{children}</div>
      ) : null}
    </div>
  );
}
