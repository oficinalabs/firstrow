import Link from "next/link";
import { channelSeriesColor } from "@/components/admin/charts/series";
import type { Channel } from "@/lib/channels";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  A ESTRUTURA DA DASHBOARD — o filtro de canal e os cabeçalhos de pergunta
 * ============================================================================
 *
 * Duas peças de chrome que a dashboard usa para se organizar, juntas porque são
 * a mesma decisão: dar ao ecrã uma hierarquia legível sem competir com os
 * cartões.
 */

/*
 * Filtro por canal — o irmão do `PeriodTabs`, mas para escolher de que liga se
 * fala. Só aparece quando há mais do que um canal (a regra `many` de
 * `channelsInScope`): com uma liga só, o backoffice inteiro é dela e um filtro
 * "todos" contra "este" não distinguia nada.
 *
 * LINKS e não botões com estado no cliente: a dashboard é `force-dynamic` e
 * filtrar é ir buscar outros números ao servidor, não esconder uns que já cá
 * estão. O canal fica no URL — partilha-se, guarda-se nos favoritos, e o
 * "voltar" do browser faz o esperado. Sem uma linha de JavaScript no cliente.
 *
 * A bolinha de cor é a MESMA que a legenda dos gráficos usa (`channelSeriesColor`):
 * quem filtra por um canal reconhece-o pela cor com que ele aparece nas barras.
 * O estado ativo é sublinhado + peso + fundo, nunca só o fundo — quem não
 * distingue os dois neutros tem de saber à mesma que canal está a ver.
 */
export function ChannelFilterTabs({
  channels,
  current,
  hrefFor,
}: {
  channels: Channel[];
  /** Canal selecionado, ou `null` para "todos os canais". */
  current: string | null;
  hrefFor: (channelId: string | null) => string;
}) {
  const items: { id: string | null; label: string; color?: string }[] = [
    { id: null, label: "Todos os canais" },
    ...channels.map((c) => ({ id: c.id, label: c.name, color: channelSeriesColor(c) })),
  ];

  return (
    <nav aria-label="Canal" className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const ativo = item.id === current;
        return (
          <Link
            key={item.id ?? "todos"}
            href={hrefFor(item.id)}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              // 44px de alvo de toque, como o PeriodTabs e o resto do backoffice.
              "inline-flex min-h-11 items-center gap-1.5 rounded-sm border px-3 font-mono text-2xs font-semibold uppercase tracking-label transition-colors",
              ativo
                ? "border-input bg-muted text-foreground underline underline-offset-4"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.color ? (
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-xs border border-border"
                style={{ background: item.color }}
              />
            ) : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/*
 * Cabeçalho de secção — agrupa a dashboard por PERGUNTA ("como vai o negócio",
 * "que evento correu melhor", "onde está o risco"), e não por tabela da base de
 * dados. É a hierarquia que o dono pediu: quem abre o ecrã lê primeiro a
 * pergunta e só depois os números que a respondem.
 *
 * Peça mínima de propósito — um rótulo mono com um filete por cima — para marcar
 * o grupo sem competir com os títulos dos cartões. O `<h2>` dá a estrutura ao
 * leitor de ecrã (os títulos dos cartões são `<h3>`), por isso a navegação por
 * títulos passa a espelhar os grupos, em vez de ser uma lista plana de cartões.
 */
export function SectionHeading({
  children,
  hint,
}: {
  children: React.ReactNode;
  /** Uma frase curta que situa o grupo, à direita do rótulo. Opcional. */
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border pt-4">
      <h2 className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {children}
      </h2>
      {hint ? <p className="text-2sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
