import { cn } from "@/lib/utils";

// Campo de formulário: label 13px/600, gap 6px, erro humano por baixo.
export function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: associação feita pelo consumidor via htmlFor
    <label className={cn("text-2sm font-semibold text-foreground", className)} {...props} />
  );
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

/** Erros assumem a culpa e dizem o que fazer — frases humanas, PT-PT. */
export function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("text-xs text-destructive", className)} {...props}>
      {children}
    </p>
  );
}
