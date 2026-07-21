import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SCANNER_PATH } from "@/lib/backoffice-zones";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  AS SECÇÕES DE UM EVENTO — uma barra de abas partilhada pelos ecrãs do evento
 * ============================================================================
 *
 * O dono pediu para deixar de saltar entre transmissão, bilhetes, editar e
 * scanner como páginas soltas: "se tou na página detalhe de um evento tenho de
 * conseguir editar e ver as coisas todas". Esta barra dá-lhes um teto comum — a
 * transmissão, os bilhetes e a edição do MESMO evento, com a aba ativa a dizer
 * onde se está.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE SÃO ABAS-LINK, E NÃO SECÇÕES FUNDIDAS NUMA PÁGINA SÓ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Cada aba continua a ser a SUA rota, com o SEU gate e a SUA query — e isso é de
 * propósito, pela mesma razão que manda no resto desta frente. A edição mostra
 * o preço (dinheiro) e vive atrás de `requireEventManager` (só o dono); os
 * bilhetes trazem nomes e emails de compradores atrás de `requireEventOperator`.
 * Fundir tudo numa página só obrigava a decidir, à mão e a cada `await`, o que
 * cada papel podia buscar — e no App Router o que a página BUSCA viaja no
 * payload do RSC mesmo que não seja desenhado. Mantendo cada aba na sua rota,
 * cada gate e cada query ficam onde já estavam testados: a barra é só
 * apresentação, e o que ela decide é que LINKS mostrar, nunca que dados servir.
 *
 * Por isso esta barra não recebe dinheiro nenhum: só o id do evento e dois
 * booleanos. `canManage` esconde a aba de editar a quem não gere o canal (o
 * `requireEventManager` da rota responde 404 na mesma se lá for à mão —
 * esconder é cortesia, o gate é lá). `hasTickets` é calculado no servidor a
 * partir de `event.ticketPriceCents != null` e entregue já como booleano: o
 * preço do bilhete nunca sai da base de dados por este caminho.
 */

export type EventTab = "transmissao" | "bilhetes" | "editar";

const ABAS: { key: EventTab; label: string }[] = [
  { key: "transmissao", label: "Transmissão" },
  { key: "bilhetes", label: "Bilhetes" },
  { key: "editar", label: "Editar" },
];

export function EventDetailTabs({
  eventId,
  active,
  canManage,
  hasTickets,
}: {
  eventId: string;
  active: EventTab;
  /** Gere o canal do evento → vê e abre a aba de edição. */
  canManage: boolean;
  /** Tem bilhete de porta → há bilhetes e scanner para abrir. */
  hasTickets: boolean;
}) {
  const abas = ABAS.filter((aba) => {
    // A aba onde se está aparece SEMPRE — senão, entrar nos bilhetes de um
    // evento que (já) não tem bilhete à venda deixava a barra sem a aba ativa.
    // Não abre porta nenhuma: só se chega a uma rota passando o gate dela, e o
    // `active` reflete a rota em que a página realmente está.
    if (aba.key === active) return true;
    // Bilhetes só existe com bilhete de porta; editar só para quem gere.
    if (aba.key === "bilhetes") return hasTickets;
    if (aba.key === "editar") return canManage;
    return true;
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border">
      {/* Abas encostadas à linha de baixo: a ativa é peso + traço + cor, nunca
          só a cor — quem não distingue os dois neutros fica na mesma a saber. */}
      <nav aria-label="Secções do evento" className="-mb-px flex items-center gap-1">
        {abas.map((aba) => {
          const ativa = aba.key === active;
          return (
            <Link
              key={aba.key}
              href={`/admin/eventos/${eventId}/${aba.key}`}
              aria-current={ativa ? "page" : undefined}
              className={cn(
                // 44px de alvo de toque, como o resto do backoffice.
                "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-2sm transition-colors",
                ativa
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {aba.label}
            </Link>
          );
        })}
      </nav>

      {/*
       * O scanner é um BOTÃO e não uma aba: abre o ecrã de porta, que é servido
       * SEM moldura (usa-se de pé, com uma mão) — não é uma secção que troca no
       * mesmo sítio, é um salto para fora. Fica ao lado das abas, à direita, e só
       * quando o evento tem bilhete de porta para validar.
       */}
      {hasTickets ? (
        <Link
          href={`${SCANNER_PATH}?evento=${eventId}`}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mb-1.5")}
        >
          Scanner de porta
        </Link>
      ) : null}
    </div>
  );
}
