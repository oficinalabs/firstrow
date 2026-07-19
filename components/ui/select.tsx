import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Escolha de uma opção entre poucas. `<select>` nativo, de propósito: traz o
 * teclado, o leitor de ecrã e a roda do telemóvel de graça, e nenhuma lista
 * feita à mão iguala isso sem centenas de linhas.
 *
 * Só a seta é nossa (`appearance-none`), porque a do sistema não segue a paleta
 * e desalinha entre browsers. Mesma altura, raio e borda do `<Input>` — os dois
 * aparecem lado a lado em formulários e não podem parecer de sítios diferentes.
 */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative flex w-full">
      <select
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-sm border border-input bg-field py-2 pr-9 pl-3 text-sm text-foreground transition-colors disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        // `pointer-events-none`: o clique atravessa e abre a lista, como
        // aconteceria se a seta fosse mesmo do controlo.
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
