import Link from "next/link";
import { cn } from "@/lib/utils";
import { PERIODS, type PeriodKey } from "@/server/stats";

/*
 * O seletor de período da dashboard.
 *
 * LINKS, e não botões com estado no cliente. A dashboard é `force-dynamic` e
 * todas as contas são feitas no servidor — mudar de período é ir buscar outros
 * números, não filtrar uns que já cá estão. Sendo links:
 *
 *   · o período fica no URL, por isso partilha-se e guarda-se nos favoritos;
 *   · o botão "voltar" do browser faz o que se espera;
 *   · funciona sem uma linha de JavaScript no cliente.
 *
 * `aria-current="page"` marca o ativo para o leitor de ecrã. O sublinhado e o
 * peso do texto acompanham a cor — o estado nunca é só o fundo, porque quem
 * não distingue os dois neutros ficaria sem saber em que período está.
 */
export function PeriodTabs({
  current,
  hrefFor,
}: {
  current: PeriodKey;
  /** Constrói o link de cada período preservando o resto do URL. */
  hrefFor: (period: PeriodKey) => string;
}) {
  return (
    <nav aria-label="Período" className="flex items-center gap-1">
      {(Object.keys(PERIODS) as PeriodKey[]).map((period) => {
        const ativo = period === current;
        return (
          <Link
            key={period}
            href={hrefFor(period)}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              // 44px de alvo de toque, como o resto do backoffice.
              "inline-flex min-h-11 items-center rounded-sm border px-3 font-mono text-2xs font-semibold uppercase tracking-label transition-colors",
              ativo
                ? "border-input bg-muted text-foreground underline underline-offset-4"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {PERIODS[period].label}
          </Link>
        );
      })}
    </nav>
  );
}
