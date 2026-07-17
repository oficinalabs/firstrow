import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Bloco de calendário (dia grande + mês) usado nas linhas de agenda. */
export function DateBlock({ date, className }: { date: Date; className?: string }) {
  const [day, month] = formatDate(date).split(" ");
  return (
    <div className={cn("w-11 shrink-0 text-center", className)}>
      {/* dia a 2 dígitos: o bloco mono do design alinha 26/09/23 na mesma largura */}
      <div className="font-mono text-lg font-semibold leading-tight">{day.padStart(2, "0")}</div>
      <div className="font-mono text-2xs text-muted-foreground uppercase">{month}</div>
    </div>
  );
}
