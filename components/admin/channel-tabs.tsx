import Link from "next/link";
import type { Channel } from "@/lib/channels";
import { cn } from "@/lib/utils";

/*
 * O seletor de canal do extrato, irmão do `PeriodTabs`: LINKS e não botões com
 * estado no cliente, pela mesma razão — a página é `force-dynamic` e todas as
 * contas são feitas no servidor. Mudar de canal é ir buscar outra fatia do
 * extrato, não filtrar linhas que já cá estão.
 *
 * Só faz sentido chamar isto quando `channels.many` — com um canal só não há
 * nada para filtrar, e é essa a regra que a página já segue para a coluna
 * "Canal" da tabela.
 */
export function ChannelTabs({
  channels,
  current,
  hrefFor,
}: {
  channels: readonly Channel[];
  /** `null` = "Todos". */
  current: string | null;
  hrefFor: (channelId: string | null) => string;
}) {
  const opcoes: { id: string | null; label: string }[] = [
    { id: null, label: "Todos" },
    ...channels.map((c) => ({ id: c.id, label: c.name })),
  ];

  return (
    <nav aria-label="Canal" className="flex flex-wrap items-center gap-1">
      {opcoes.map((opcao) => {
        const ativo = opcao.id === current;
        return (
          <Link
            key={opcao.id ?? "todos"}
            href={hrefFor(opcao.id)}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-sm border px-3 font-mono text-2xs font-semibold uppercase tracking-label transition-colors",
              ativo
                ? "border-input bg-muted text-foreground underline underline-offset-4"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {opcao.label}
          </Link>
        );
      })}
    </nav>
  );
}
