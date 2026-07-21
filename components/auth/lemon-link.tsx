import Link from "next/link";
import { cn } from "@/lib/utils";

/** Link de texto com o sublinhado limão do design (marcador, nunca CTA). */
export function LemonLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "alvo-toque font-semibold text-2sm underline decoration-2 decoration-accent underline-offset-4 transition-colors hover:decoration-foreground",
        className,
      )}
      {...props}
    />
  );
}
