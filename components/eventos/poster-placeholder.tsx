import { cn } from "@/lib/utils";

// A BD ainda não guarda cartazes/thumbnails (Fase 0): no lugar da imagem fica
// o padrão listrado do design, construído só com tokens do tema.
//
// Nota: usar os tokens crus (--muted/--card) e NÃO os --color-* do @theme inline.
// Os --color-* são resolvidos uma vez em :root (valor light) e herdados já
// calculados, logo não acompanhavam o data-theme="dark" desta superfície.
export function PosterPlaceholder({
  label = "cartaz do evento",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("flex items-center justify-center overflow-hidden bg-muted", className)}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--muted), var(--muted) 10px, var(--card) 10px, var(--card) 20px)",
      }}
    >
      <span className="font-mono text-2xs text-muted-foreground/80">[ {label} ]</span>
    </div>
  );
}
