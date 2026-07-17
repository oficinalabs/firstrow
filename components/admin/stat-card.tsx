import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const HINT_TONES = {
  muted: "text-muted-foreground",
  success: "text-success",
  destructive: "text-destructive",
} as const;

// Cartão de indicador do backoffice: label mono uppercase, valor grande em
// mono tabular (€ e contagens chegam já formatados por lib/format.ts).
export function StatCard({
  label,
  value,
  hint,
  hintTone = "muted",
  valueClassName,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: string;
  value: React.ReactNode;
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
      </span>
      {hint ? <span className={cn("mt-1 text-xs", HINT_TONES[hintTone])}>{hint}</span> : null}
    </Card>
  );
}
