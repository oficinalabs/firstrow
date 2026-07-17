import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Preço em euros, sempre mono e sempre via formatEuro. */
export function PriceTag({ cents, className }: { cents: number; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap font-mono font-medium", className)}>
      {formatEuro(cents)}
    </span>
  );
}
