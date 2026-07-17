"use client";

import { usePathname } from "next/navigation";
import { type BackofficeNavItem, BackofficeShell } from "@/components/ui/backoffice-shell";

// Navegação completa do backoffice (Frente E). Scanner e Bilhetes são páginas
// da Frente D — o item fica na sidebar desde já, como no design.
const NAV: BackofficeNavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Eventos", href: "/admin/eventos" },
  { label: "Subscritores", href: "/admin/subscritores" },
  { label: "Ganhos", href: "/admin/ganhos" },
  { label: "Scanner", href: "/admin/scanner" },
  { label: "Plataforma", href: "/admin/plataforma" },
];

/** Shell da fundação + item ativo derivado do pathname (prefixo mais longo). */
export function BackofficeChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = NAV.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <BackofficeShell nav={NAV} activeHref={active?.href}>
      {children}
    </BackofficeShell>
  );
}
