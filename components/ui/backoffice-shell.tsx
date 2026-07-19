import Image from "next/image";
import Link from "next/link";
import { tenantStyle } from "@/components/ui/tenant-scope";
import { defaultChannel } from "@/lib/channels";
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
 * A cor do canal é derivada DUAS vezes, e não é desperdício: a página é papel
 * mas a barra da FirstRow é escura nos dois temas (--bar, ver globals.css). Uma
 * cor que se leia em papel não se lê na barra e vice-versa — não há meio-termo,
 * porque cumprir 4,5:1 contra papel e contra quase-preto ao mesmo tempo é
 * aritmeticamente impossível. Cada superfície deriva a sua.
 */
export function BackofficeShell({
  nav = DEFAULT_NAV,
  activeHref,
  children,
}: {
  nav?: BackofficeNavItem[];
  activeHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme="light"
      className="flex min-h-dvh w-full flex-col bg-background text-foreground md:flex-row"
      style={tenantStyle(defaultChannel, "light")}
    >
      {/* topo mobile (o backoffice é desktop-first; isto é o mínimo digno) */}
      <header className="flex h-13 items-center justify-between bg-bar px-4 text-bar-foreground md:hidden">
        <BrandRow />
      </header>

      <aside
        className="hidden w-54 shrink-0 flex-col bg-bar py-4 text-bar-foreground md:flex"
        style={tenantStyle(defaultChannel, "dark")}
      >
        <div className="flex items-center border-b border-bar-border px-4.5 pt-1 pb-3.5">
          <BrandRow />
        </div>
        <div className="flex items-center gap-2.5 px-4.5 py-3.5">
          <span className="flex size-7 items-center justify-center rounded-sm bg-bar-active font-mono text-2xs text-bar-muted">
            {defaultChannel.initials}
          </span>
          <span className="flex flex-col">
            <span className="text-2sm font-bold">{defaultChannel.name}</span>
            {/* text-(--tenant) como no resto do projeto, em vez de style inline. */}
            <span className="font-mono text-2xs text-(--tenant)">● canal ativo</span>
          </span>
        </div>
        <nav aria-label="Backoffice" className="mt-1.5 flex flex-col">
          {nav.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "border-l-3 px-4.5 py-2.5 text-2sm transition-colors",
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
      <Link href="/admin" className="flex items-center" aria-label="Backoffice FirstRow">
        <Image src="/brand/firstrow-lockup-h-branco.svg" alt="FirstRow" width={83} height={20} />
      </Link>
      <span className="ml-auto font-mono text-2xs text-bar-muted">BACKOFFICE</span>
    </>
  );
}
