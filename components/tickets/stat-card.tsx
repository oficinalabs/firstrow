import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE: Record<"default" | "success" | "destructive", string> = {
  default: "text-foreground",
  success: "text-success",
  destructive: "text-destructive",
};

/** Cartão de métrica do BO: label mono uppercase + número tabular grande. */
export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1.5 font-mono text-2xl font-semibold tabular-nums", TONE[tone])}>
        {value}
        {sub ? <span className="text-sm font-normal text-muted-foreground">{sub}</span> : null}
      </p>
    </Card>
  );
}
