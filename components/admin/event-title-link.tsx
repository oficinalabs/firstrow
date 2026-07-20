import Link from "next/link";
import { eventHubPath } from "@/lib/event-rules";
import { cn } from "@/lib/utils";

/*
 * O nome de um evento, no backoffice, é sempre a porta para ele.
 *
 * Estava a ser texto morto na dashboard e na lista, com um "Abrir" pequenino no
 * fim da linha a fazer o trabalho — e a coisa em que toda a gente carrega
 * primeiro é no nome. Um componente só para os dois sítios não é cerimónia: é o
 * que garante que o destino, o alvo de toque e o foco são os mesmos nos dois, em
 * vez de dois `<Link>` copiados que divergem à terceira alteração.
 *
 * ALVO DE TOQUE: `min-h-11` são os 44px do costume, e ficam aqui porque valem
 * nos dois sítios. Quem chama de dentro de uma tabela junta-lhe um `-my-2`, que
 * devolve à célula o espaço que o `py-2` dela já dá: a área clicável cresce para
 * os 44px sem a linha passar a ter o dobro da altura.
 *
 * FOCO: não leva `focus:` nenhum de propósito. O `:focus-visible` global (2px de
 * `--color-ring`, com desvio) já desenha o anel em tudo o que é focável, e uma
 * regra local por cima era outra coisa para manter e para divergir.
 */
export function EventTitleLink({
  eventId,
  title,
  muted,
  className,
}: {
  eventId: string;
  title: string;
  /** Eventos terminados aparecem esbatidos na lista — o link acompanha. */
  muted?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={eventHubPath(eventId)}
      className={cn(
        "inline-flex min-h-11 items-center font-semibold underline-offset-4 transition-colors hover:underline",
        muted ? "text-muted-foreground hover:text-foreground" : "text-foreground",
        className,
      )}
    >
      {title}
    </Link>
  );
}
