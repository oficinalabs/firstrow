import Image from "next/image";
import Link from "next/link";
import { SiteLink } from "@/components/ui/site-link";
import { tenantStyle } from "@/components/ui/tenant-scope";
import type { Channel } from "@/lib/channels";
import { cn } from "@/lib/utils";

export type BackofficeNavItem = { label: string; href: string };

const DEFAULT_NAV: BackofficeNavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Eventos", href: "/admin/eventos" },
  { label: "Subscritores", href: "/admin/subscritores" },
  { label: "Ganhos", href: "/admin/ganhos" },
];

/*
 * Moldura do backoffice: ferramenta de trabalho, desktop-first, só light.
 * Sidebar tinta (moldura FirstRow) com o canal no topo; conteúdo em papel.
 * `activeHref` marca o item ativo (borda limão à esquerda).
 *
 * `channel` deixou de ser lido de uma constante e passa a vir por prop, porque
 * a resposta a "que canal é este backoffice?" passou a depender de quem entra.
 * Vem preenchido quando a pessoa gere UM canal; vem vazio quando a pergunta não
 * tem resposta única (a FirstRow, que gere todos) — e então o bloco do canal
 * não aparece, em vez de mostrar um canal à sorte.
 *
 * Quando vem, a cor é derivada DUAS vezes, e não é desperdício: a página é papel
 * mas a barra da FirstRow é escura nos dois temas (--bar, ver globals.css). Uma
 * cor que se leia em papel não se lê na barra e vice-versa — não há meio-termo,
 * porque cumprir 4,5:1 contra papel e contra quase-preto ao mesmo tempo é
 * aritmeticamente impossível. Cada superfície deriva a sua.
 */
export function BackofficeShell({
  nav = DEFAULT_NAV,
  activeHref,
  channel,
  children,
}: {
  nav?: BackofficeNavItem[];
  activeHref?: string;
  channel?: Channel;
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme="light"
      className="flex min-h-dvh w-full flex-col bg-background text-foreground md:flex-row"
      style={channel ? tenantStyle(channel, "light") : undefined}
    >
      {/*
       * Topo mobile. O backoffice é desktop-first, mas até aqui "desktop-first"
       * tinha um significado que ninguém queria: abaixo de 768px a barra
       * lateral é `hidden` e NADA a substituía — o backoffice ficava sem
       * navegação nenhuma. Do telemóvel dava para aterrar em `/admin` e não
       * havia forma de chegar a Eventos, Ganhos ou ao Scanner sem escrever o
       * endereço à mão. E o Scanner é justamente o que se usa no telemóvel, à
       * porta do recinto.
       *
       * A tira horizontal repete os MESMOS itens da barra lateral (a mesma
       * lista, não uma cópia) e rola quando não cabem — em vez de um menu que
       * abre e fecha, que é mais código e mais uma coisa para partir numa
       * ferramenta que se usa com uma mão e pressa.
       */}
      <div className="md:hidden">
        {/* `gap-3` para o atalho do site não ficar colado ao rótulo BACKOFFICE
            (que já é empurrado para a direita pelo `ml-auto` do BrandRow). */}
        <header className="flex h-13 items-center justify-between gap-3 bg-bar px-4 text-bar-foreground">
          <BrandRow />
          <SiteLink />
        </header>
        <nav
          aria-label="Backoffice"
          className="flex gap-1 overflow-x-auto border-b border-bar-border bg-bar px-2 text-bar-foreground"
        >
          {nav.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // `alvo-toque-alto` e não `alvo-toque`: são itens encostados,
                  // e uma área esticada roubava o toque ao vizinho.
                  "alvo-toque-alto shrink-0 whitespace-nowrap border-b-2 px-3 text-2sm transition-colors",
                  isActive
                    ? "border-accent font-semibold text-bar-foreground"
                    : "border-transparent font-medium text-bar-muted",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <aside
        className="hidden w-54 shrink-0 flex-col bg-bar py-4 text-bar-foreground md:flex"
        style={channel ? tenantStyle(channel, "dark") : undefined}
      >
        <div className="flex items-center border-b border-bar-border px-4.5 pt-1 pb-3.5">
          <BrandRow />
        </div>
        {/* Atalho para o site, logo abaixo da marca — perto do topo, como o
            simétrico "Backoffice" que o header do site já tem. Sem borda própria
            para não pesar a coluna; encosta ao bloco do canal (ou à navegação,
            quando não há canal). */}
        <div className="px-4.5 pt-3 pb-1">
          <SiteLink />
        </div>
        {channel ? (
          <div className="flex items-center gap-2.5 px-4.5 py-3.5">
            <span className="flex size-7 items-center justify-center rounded-sm bg-bar-active font-mono text-2xs text-bar-muted">
              {channel.initials}
            </span>
            <span className="flex flex-col">
              <span className="text-2sm font-bold">{channel.name}</span>
              {/* text-(--tenant) como no resto do projeto, em vez de style inline. */}
              <span className="font-mono text-2xs text-(--tenant)">● canal ativo</span>
            </span>
          </div>
        ) : null}
        <nav aria-label="Backoffice" className="mt-1.5 flex flex-col">
          {nav.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // Itens encostados uns aos outros: cresce a caixa (só em
                  // apontador grosso), não a área por baixo — que se sobrepunha
                  // à do vizinho e entregava o toque ao item errado.
                  "alvo-toque-alto border-l-3 px-4.5 py-2.5 text-2sm transition-colors",
                  isActive
                    ? "border-accent bg-bar-active font-semibold text-bar-foreground"
                    : "border-transparent font-medium text-bar-muted hover:text-bar-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-7">{children}</main>
    </div>
  );
}

function BrandRow() {
  return (
    <>
      <Link href="/admin" className="alvo-toque flex items-center" aria-label="Backoffice FirstRow">
        <Image src="/brand/firstrow-lockup-h-branco.svg" alt="FirstRow" width={83} height={20} />
      </Link>
      <span className="ml-auto font-mono text-2xs text-bar-muted">BACKOFFICE</span>
    </>
  );
}
