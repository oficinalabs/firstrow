import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const HINT_TONES = {
  muted: "text-muted-foreground",
  success: "text-success",
  // Estado intermédio — o degrau que faltava entre "está bem" e "está mau".
  // O token já existia (--warning) e o Badge já o usava; só o StatCard é que
  // obrigava a escolher entre calar o aviso ou gritá-lo como se fosse falha.
  warning: "text-warning",
  destructive: "text-destructive",
} as const;

// Cartão de indicador: label mono uppercase + valor grande mono tabular (€ e
// contagens chegam já formatados por lib/format.ts). Sufixo (`sub`), pista
// (`hint`/`hintTone`) e cor do valor (`valueClassName`) são opcionais.
// Canónico — usado pelo backoffice e pelos bilhetes.
export function StatCard({
  label,
  value,
  sub,
  hint,
  hintTone = "muted",
  valueClassName,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: keyof typeof HINT_TONES;
  valueClassName?: string;
}) {
  return (
    <Card className={cn("flex flex-col px-4 py-3.5", className)} {...props}>
      <span className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {label}
      </span>
      <span className={cn("mt-2 font-mono text-2xl font-semibold tabular-nums", valueClassName)}>
        {value}
        {sub ? <span className="text-sm font-normal text-muted-foreground">{sub}</span> : null}
      </span>
      {hint ? <span className={cn("mt-1 text-xs", HINT_TONES[hintTone])}>{hint}</span> : null}
    </Card>
  );
}
