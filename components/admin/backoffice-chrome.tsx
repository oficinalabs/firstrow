"use client";

import { usePathname } from "next/navigation";
import { type BackofficeNavItem, BackofficeShell } from "@/components/ui/backoffice-shell";
import type { Channel } from "@/lib/channels";

// Navegação completa do backoffice (Frente E). Scanner e Bilhetes são páginas
// da Frente D — o item fica na sidebar desde já, como no design.
const NAV: BackofficeNavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Eventos", href: "/admin/eventos" },
  { label: "Subscritores", href: "/admin/subscritores" },
  { label: "Ganhos", href: "/admin/ganhos" },
  { label: "Scanner", href: "/admin/scanner" },
];

// Só para a FirstRow: mostra totais da plataforma inteira, sem âmbito de canal.
const PLATFORM_NAV: BackofficeNavItem = { label: "Plataforma", href: "/admin/plataforma" };

/**
 * Shell da fundação + item ativo derivado do pathname (prefixo mais longo).
 *
 * `isPlatformAdmin` chega por prop, decidido no servidor (`app/admin/layout.tsx`).
 * Esconder o link é cortesia, não segurança — quem lá for à mão leva `notFound()`
 * da própria página; isto só evita pôr na sidebar de um dono de liga um item
 * que ele não pode abrir.
 */
export function BackofficeChrome({
  isPlatformAdmin = false,
  channel,
  children,
}: {
  isPlatformAdmin?: boolean;
  channel?: Channel;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = isPlatformAdmin ? [...NAV, PLATFORM_NAV] : NAV;
  const active = nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <BackofficeShell nav={nav} activeHref={active?.href} channel={channel}>
      {children}
    </BackofficeShell>
  );
}
