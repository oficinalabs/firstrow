import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Etiquetas mono uppercase (raio 4px). Para "AO VIVO" usar o LiveBadge.
export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border px-2 py-1 font-mono text-2xs font-semibold uppercase tracking-label",
  {
    variants: {
      variant: {
        outline: "border-input bg-transparent text-muted-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        // limão: em light é marcador (fundo + texto tinta); em dark é linha/texto
        accent:
          "border-transparent bg-accent text-accent-foreground dark:border-accent dark:bg-transparent dark:text-accent",
        success: "border-transparent bg-success font-bold text-success-foreground",
        warning: "border-transparent bg-warning font-bold text-warning-foreground",
        destructive: "border-transparent bg-destructive font-bold text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
