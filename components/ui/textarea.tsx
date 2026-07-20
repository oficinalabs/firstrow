import { cn } from "@/lib/utils";

/*
 * Texto de vários parágrafos. Mesmas medidas do `Input` (raio, borda, fundo de
 * campo, marcação de erro por `aria-invalid`) — o que muda é a altura e o
 * `field-sizing-content`, que faz a caixa crescer com o que se escreve em vez
 * de obrigar a rolar dentro de um retângulo de três linhas.
 *
 * `min-h-24` porque a caixa tem de PARECER que aceita um parágrafo antes de
 * alguém escrever o primeiro; `max-h-80` para que uma descrição longa não
 * empurre o botão de gravar para fora do ecrã. Os browsers sem
 * `field-sizing` (Firefox, à data) ficam com uma caixa de altura mínima e a
 * barra de rolagem de sempre — degrada, não parte.
 */
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "field-sizing-content max-h-80 min-h-24 w-full min-w-0 resize-y rounded-sm border border-input bg-field px-3 py-2.5 text-sm leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
