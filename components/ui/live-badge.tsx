import { cn } from "@/lib/utils";

/** Ponto a pulsar (herda a cor do texto). Reutilizável em botões live. */
export function PulseDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 animate-fr-pulse rounded-full bg-current", className)}
    />
  );
}

/** Badge AO VIVO — vermelho live é SÓ para direto/urgência. */
export function LiveBadge({
  className,
  children = "Ao vivo",
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs bg-live px-2 py-1 font-mono text-2xs font-bold uppercase tracking-label text-live-foreground",
        className,
      )}
      {...props}
    >
      <PulseDot />
      {children}
    </span>
  );
}
