import { type BrandedChannel, derivePaletteCached, paletteVars, type Surface } from "@/lib/colors";
import { cn } from "@/lib/utils";

/*
 * Co-branding: pega no canal e põe a paleta derivada nas variáveis CSS de um
 * pedaço da árvore. Quem está lá dentro usa `text-(--tenant)`, `bg-(--tenant-solid)`,
 * `text-(--tenant-on-solid)`, `bg-(--tenant-soft)` — e nunca precisa de saber que
 * cor a liga escolheu nem se ela foi ajustada.
 *
 * Duas garantias, e as duas saem da mesma decisão (derivar no render, em estilo
 * inline, sem efeitos):
 *
 *  - **Sem flash de cor errada.** As variáveis vão no HTML que o servidor manda.
 *    Não há um primeiro pintar com a cor antiga seguido de correção — a cor certa
 *    já vem no primeiro byte. É por isto que não se usa `useEffect` nem se lê o
 *    `getComputedStyle`: qualquer um dos dois só corre depois de haver ecrã.
 *  - **Sem hydration mismatch.** `derivePalette` é uma função pura — mesma cor e
 *    mesma superfície dão sempre exatamente o mesmo hex, no servidor e no browser
 *    (ver scripts/check-contrast.ts). O que o React compara na hidratação bate
 *    certo por construção, não por sorte.
 *
 * Onde a cor do canal NÃO entra, e não é por esquecimento:
 *  - `/bilhetes` e `/conta` são transversais — são da FirstRow, não da liga.
 *  - Botões de pagamento e checkout usam a ação da FirstRow (tinta). Dinheiro
 *    tem de parecer sempre igual, venha de que canal vier.
 *  - O vermelho AO VIVO nunca é tocado: é sinal de estado, não de marca.
 */

/**
 * A paleta do canal em variáveis CSS, pronta para o `style` de um elemento que
 * já existe — assim o co-branding não custa uma `<div>` a mais.
 *
 * `surface` é o tema em que o elemento vive (o espectador é `dark`, o backoffice
 * é `light`), porque a mesma cor de marca precisa de derivações diferentes para
 * se ler em papel e em fundo escuro.
 */
export function tenantStyle(
  channel: BrandedChannel | null | undefined,
  surface: Surface,
): React.CSSProperties | undefined {
  if (!channel) return undefined;
  return paletteVars(derivePaletteCached(channel, surface).palette) as React.CSSProperties;
}

export type TenantScopeProps = React.ComponentProps<"div"> & {
  /** Sem canal, o subtree fica só com a identidade FirstRow. */
  channel?: BrandedChannel | null;
  surface: Surface;
};

/**
 * O mesmo, mas quando é preciso um subtree próprio — a pré-visualização do
 * seletor de cor, por exemplo, que tem de mostrar a página do canal com a cor
 * nova sem contaminar o backoffice à volta.
 */
export function TenantScope({ channel, surface, className, style, ...props }: TenantScopeProps) {
  return (
    <div
      className={cn(className)}
      // `style` do consumidor por último: quem chama ainda manda.
      style={{ ...tenantStyle(channel, surface), ...style }}
      {...props}
    />
  );
}
