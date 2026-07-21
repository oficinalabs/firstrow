import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Regras do design: tinta = ação principal (1 por ecrã; inverte em dark via
// tokens) · vermelho live só em urgência/direto · limão nunca em CTAs ·
// CTAs de compra dizem sempre o preço.
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-semibold transition-colors disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-muted disabled:text-muted-foreground/60",
        secondary:
          "border border-input bg-transparent text-foreground hover:bg-muted/60 disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground/60",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-muted disabled:text-muted-foreground/60",
        live: "bg-live font-bold text-live-foreground hover:bg-live/90 disabled:bg-muted disabled:text-muted-foreground/60",
      },
      /*
       * `toque:min-h-…` nos dois tamanhos pequenos: 36px e 40px chegam para um
       * rato e não chegam para um dedo (44px é a medida da polpa). O `min-h`
       * ganha ao `h-*` sem o apagar, por isso no ecrã grande o botão continua
       * exactamente com a altura desenhada — o crescimento acontece só onde o
       * apontador é grosso. O `lg` já nasceu com 44.
       */
      size: {
        sm: "h-9 px-3.5 toque:min-h-(--alvo-toque)",
        default: "h-10 px-4.5 toque:min-h-(--alvo-toque)",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
