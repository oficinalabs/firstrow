import Image from "next/image";
import Link from "next/link";
import { tenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { key: "canal", label: "Canal", href: "/" },
  { key: "bilhetes", label: "Bilhetes", href: "/bilhetes" },
  { key: "conta", label: "Conta", href: "/conta" },
] as const;

export type ViewerNavKey = (typeof NAV_ITEMS)[number]["key"];

/*
 * Moldura do espectador: barra FirstRow (sempre tinta) + linha de 3px na cor
 * do canal (co-branding) + conteúdo dark por defeito. Expõe a cor do canal
 * como var --tenant para os descendentes (ex.: bg-(--tenant), text-(--tenant)).
 */
export function ViewerShell({
  active,
  children,
}: {
  active?: ViewerNavKey;
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme="dark"
      className="flex min-h-dvh flex-col bg-background text-foreground"
      style={{ "--tenant": tenant.accentColor } as React.CSSProperties}
    >
      <header className="border-b border-bar-border bg-bar text-bar-foreground">
        <div className="mx-auto flex h-13 w-full max-w-6xl items-center justify-between px-4 md:h-14 md:px-8">
          <Link href="/" className="flex shrink-0 items-center" aria-label="FirstRow — início">
            <Image
              src="/brand/firstrow-lockup-h-branco.svg"
              alt="FirstRow"
              width={99}
              height={24}
              priority
            />
          </Link>
          <nav aria-label="Navegação principal" className="flex items-center gap-5 md:gap-6">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-bar-foreground",
                  active === item.key ? "text-bar-foreground" : "text-bar-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div aria-hidden className="h-0.75 shrink-0 bg-(--tenant)" />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
