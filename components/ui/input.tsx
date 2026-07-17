import { cn } from "@/lib/utils";

// Altura 44px (touch). Erro: marcar com aria-invalid (borda) e juntar um
// FieldError com frase humana por baixo — ver field.tsx.
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full min-w-0 rounded-sm border border-input bg-field px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
