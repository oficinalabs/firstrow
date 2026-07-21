"use client";

import { usePathname } from "next/navigation";
import { type BackofficeNavItem, BackofficeShell } from "@/components/ui/backoffice-shell";
import {
  type BackofficeGate,
  EVENTS_PATH,
  gateForPath,
  SCANNER_PATH,
} from "@/lib/backoffice-zones";
import type { Channel } from "@/lib/channels";

/*
 * Navegação completa do backoffice.
 *
 * Fica depois de "Eventos" de propósito: o trabalho do dia-a-dia é o evento;
 * o canal mexe-se uma vez e volta-se lá raramente.
 *
 * "Pagamentos" fica encostado a "Ganhos" porque são a mesma pergunta em dois
 * tempos: os Ganhos são o dinheiro que entrou, os Pagamentos são o que ficou a
 * meio. Vem primeiro porque é o que precisa de alguém — o extrato só se lê.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  A LISTA NÃO SE FILTRA A OLHO — filtra-se pela tabela das zonas
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Cada item é classificado por `gateForPath`, a MESMA função que o `proxy.ts`
 * usa para decidir se corta o pedido. Não há aqui uma segunda opinião sobre
 * quem vê o quê: se a tabela disser que `/admin/ganhos` é `manage`, o item
 * desaparece exatamente para quem a porta recusaria.
 *
 * Antes isto era um `isPlatformAdmin` à parte, que só sabia responder por
 * "Plataforma". Com o staff a entrar, a lista passou a ter de esconder também
 * dinheiro e compradores — e uma segunda regra escrita à mão aqui era a
 * candidata óbvia a divergir da porta.
 */
const NAV: BackofficeNavItem[] = [
  { label: "Dashboard", href: "/admin" },
  /*
   * UM só item para os eventos, e para os dois papéis. A rota é a mesma
   * (`/admin/eventos`) e decide lá dentro que lista serve: com receita para quem
   * gere, sem um número de dinheiro para quem só opera. Eram DOIS itens —
   * "Eventos" e "Agenda" — até esta frente os fundir a pedido do dono. A quem só
   * opera, este é o primeiro da lista que a sidebar lhe mostra (o Dashboard e o
   * dinheiro ficam de fora pela mesma tabela de zonas), logo a casa dele.
   */
  { label: "Eventos", href: EVENTS_PATH },
  { label: "Canais", href: "/admin/canais" },
  { label: "Subscritores", href: "/admin/subscritores" },
  { label: "Pagamentos", href: "/admin/pagamentos" },
  { label: "Ganhos", href: "/admin/ganhos" },
  { label: "Scanner", href: SCANNER_PATH },
  // Só para a FirstRow: totais da plataforma inteira, sem âmbito de canal.
  { label: "Plataforma", href: "/admin/plataforma" },
];

/**
 * Shell da fundação + item ativo derivado do pathname (prefixo mais longo).
 *
 * `gates` chega por prop, decidido no servidor (`app/admin/layout.tsx`):
 * componentes de cliente não podem chamar predicados que arrastam o `db`.
 * Esconder um link é cortesia, não segurança — quem lá for à mão leva com o
 * gate na mesma, primeiro no `proxy.ts` e depois na própria página.
 */
export function BackofficeChrome({
  gates,
  channel,
  children,
}: {
  gates: readonly BackofficeGate[];
  channel?: Channel;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  /*
   * O SCANNER NÃO LEVA MOLDURA, e não é preciosismo.
   *
   * Usa-se de pé, à porta do recinto, com pouca luz e uma mão só. Dentro da
   * moldura ficava com a barra da FirstRow por cima, o padding do `main` à
   * volta e uma costura clara à roda de um ecrã que é escuro de propósito —
   * tudo espaço roubado ao alvo da câmara e ao contraste, no único ecrã do
   * produto que se usa com o telemóvel na mão e a fila à espera.
   *
   * Fica aqui, e não num route group, porque o gate e o corte do `proxy.ts`
   * têm de continuar a apanhar `/admin/scanner` — tirá-lo de debaixo de
   * `/admin` mudava o caminho e com ele a proteção.
   */
  if (pathname === SCANNER_PATH || pathname.startsWith(`${SCANNER_PATH}/`)) {
    return <>{children}</>;
  }

  const nav = NAV.filter((item) => gates.includes(gateForPath(item.href)));
  const active = nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <BackofficeShell nav={nav} activeHref={active?.href} channel={channel}>
      {children}
    </BackofficeShell>
  );
}
