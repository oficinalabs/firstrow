import { cn } from "@/lib/utils";

/*
 * Tabela compacta: linhas 36px, só hairlines (zebra não), cabeçalho mono
 * uppercase. Datas e € com `numeric` → mono tabular alinhado à direita.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE O CONTENTOR É UM `container` E NÃO HÁ MEDIA QUERY
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Em ecrã estreito a tabela passa a cartões (a regra vive em `globals.css`, uma
 * vez para as catorze tabelas do backoffice). Quem decide se ela cabe é o
 * ESPAÇO QUE ELA TEM, não a largura da janela.
 *
 * Medido antes de escolher assim: `/admin/ganhos` a 768px — um tablet na régie,
 * que é caso de uso real — já cortava as colunas do dinheiro, porque a barra
 * lateral come 216px e sobram 552. Uma media query a `md` dava a tabela por boa
 * nessa largura e o valor líquido ficava fora do ecrã. Com `container-type` a
 * pergunta passa a ser a certa, e a mesma regra serve a página inteira e uma
 * coluna estreita ao lado de um gráfico sem ninguém escolher breakpoints.
 *
 * O `overflow-x-auto` fica como rede de segurança para o caso raro de uma
 * célula invulgarmente larga com a tabela ainda em modo tabela.
 */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto [container-type:inline-size]">
      {/*
       * `data-tabela` é o âmbito da regra dos cartões: sem ele, a regra
       * apanhava qualquer `<table>` que viesse a existir dentro de um
       * contentor — incluindo uma que alguém quisesse mesmo deixar em tabela.
       *
       * `role` explícito em toda a estrutura: no modo cartão o CSS troca o
       * `display` das linhas e das células, e trocar o display APAGA o papel
       * implícito de tabela no Chrome e no Firefox — um leitor de ecrã deixava
       * de anunciar linhas e células e passava a ler texto solto. Com o papel
       * escrito à mão, a semântica sobrevive à mudança de desenho.
       */}
      <table
        // biome-ignore lint/a11y/noRedundantRoles: NÃO é redundante aqui — no modo cartão o CSS muda o `display` e isso apaga o papel implícito. Medido na árvore de acessibilidade do Chrome: com `display:block` e sem papel escrito, a célula sai como `LayoutTableCell` (markup de layout, que os leitores de ecrã ignoram enquanto tabela); com o papel escrito, sai como `cell` dentro de `table`/`rowgroup`/`row`.
        role="table"
        data-tabela=""
        className={cn("w-full caption-bottom text-2sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      // biome-ignore lint/a11y/noRedundantRoles: NÃO é redundante aqui — no modo cartão o CSS muda o `display` e isso apaga o papel implícito. Medido na árvore de acessibilidade do Chrome: com `display:block` e sem papel escrito, a célula sai como `LayoutTableCell` (markup de layout, que os leitores de ecrã ignoram enquanto tabela); com o papel escrito, sai como `cell` dentro de `table`/`rowgroup`/`row`.
      role="rowgroup"
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      // biome-ignore lint/a11y/noRedundantRoles: NÃO é redundante aqui — no modo cartão o CSS muda o `display` e isso apaga o papel implícito. Medido na árvore de acessibilidade do Chrome: com `display:block` e sem papel escrito, a célula sai como `LayoutTableCell` (markup de layout, que os leitores de ecrã ignoram enquanto tabela); com o papel escrito, sai como `cell` dentro de `table`/`rowgroup`/`row`.
      role="rowgroup"
      className={cn("[&_tr]:border-b [&_tr]:border-muted [&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      // biome-ignore lint/a11y/noRedundantRoles: NÃO é redundante aqui — no modo cartão o CSS muda o `display` e isso apaga o papel implícito. Medido na árvore de acessibilidade do Chrome: com `display:block` e sem papel escrito, a célula sai como `LayoutTableCell` (markup de layout, que os leitores de ecrã ignoram enquanto tabela); com o papel escrito, sai como `cell` dentro de `table`/`rowgroup`/`row`.
      role="row"
      className={cn("transition-colors hover:bg-muted/40", className)}
      {...props}
    />
  );
}

type CellProps = {
  numeric?: boolean;
  /**
   * O rótulo da coluna, para o modo cartão o mostrar à frente do valor.
   *
   * Em tabela é o cabeçalho que diz a que coluna pertence a célula; em cartão
   * não há cabeçalho, e um número sozinho não diz nada — "52,50 €" tanto pode
   * ser bruto como líquido como comissão. A `DataTable` preenche isto sozinha a
   * partir do `header` da coluna; só os rodapés escritos à mão é que o passam.
   */
  label?: string;
  /** Título do cartão: a toda a largura, sem rótulo, em primeiro. */
  destaque?: boolean;
  /** Rodapé do cartão (a coluna das ações) — ver a regra em `globals.css`. */
  accoes?: boolean;
};

export function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & CellProps) {
  return (
    // Sem `role` explícito, ao contrário das restantes células: o cabeçalho é o
    // único que NÃO sobrevive ao modo cartão — o `thead` inteiro fica
    // `display:none` lá — por isso o papel implícito do `<th>` chega e sobra.
    // `scope="col"` fica: ajuda a associar cabeçalho e célula no modo tabela.
    <th
      scope="col"
      className={cn(
        "h-9 px-2 text-left align-middle font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground first:pl-0 last:pr-0",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  label,
  destaque,
  accoes,
  ...props
}: React.ComponentProps<"td"> & CellProps) {
  return (
    <td
      // biome-ignore lint/a11y/noRedundantRoles: NÃO é redundante aqui — no modo cartão o CSS muda o `display` e isso apaga o papel implícito. Medido na árvore de acessibilidade do Chrome: com `display:block` e sem papel escrito, a célula sai como `LayoutTableCell` (markup de layout, que os leitores de ecrã ignoram enquanto tabela); com o papel escrito, sai como `cell` dentro de `table`/`rowgroup`/`row`.
      role="cell"
      data-rotulo={label || undefined}
      data-destaque={destaque ? "" : undefined}
      data-accoes={accoes ? "" : undefined}
      className={cn(
        "px-2 py-2 align-middle first:pl-0 last:pr-0",
        numeric && "text-right font-mono font-medium tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
