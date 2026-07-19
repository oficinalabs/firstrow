"use client";

import { usePathname } from "next/navigation";
import { type BackofficeNavItem, BackofficeShell } from "@/components/ui/backoffice-shell";
import type { Channel } from "@/lib/channels";

/*
 * Navegação completa do backoffice. Scanner e Bilhetes são páginas da Frente D
 * — o item fica na sidebar desde já, como no design.
 *
 * "Canais" aparece a toda a gente que entra aqui, e não só à FirstRow: o gate
 * do `/admin` já exige ser `owner` de algum canal (`canEnterBackoffice`), por
 * isso quem chega tem sempre pelo menos um canal para gerir. O que muda com o
 * papel é o que a página mostra lá dentro — a FirstRow vê todos, um dono vê o
 * seu (`manageScope`) — e quem pode CRIAR canais, que é só a FirstRow.
 *
 * Fica depois de "Eventos" de propósito: o trabalho do dia-a-dia é o evento;
 * o canal mexe-se uma vez e volta-se lá raramente.
 *
 * "Pagamentos" fica encostado a "Ganhos" porque são a mesma pergunta em dois
 * tempos: os Ganhos são o dinheiro que entrou, os Pagamentos são o que ficou a
 * meio. Vem primeiro porque é o que precisa de alguém — o extrato só se lê.
 */
const NAV: BackofficeNavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Eventos", href: "/admin/eventos" },
  { label: "Canais", href: "/admin/canais" },
  { label: "Subscritores", href: "/admin/subscritores" },
  { label: "Pagamentos", href: "/admin/pagamentos" },
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
