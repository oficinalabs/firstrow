import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  O ATALHO DO BACKOFFICE PARA O SITE — o inverso do BackofficeLink
 * ============================================================================
 *
 * O `BackofficeLink` leva do site para o backoffice e SÓ aparece a quem tem
 * poderes (é um componente de servidor que lê a sessão e devolve `null` a quem
 * não os tem). Este faz o caminho contrário e NÃO precisa dessa verificação:
 *
 *  • só existe dentro do shell do backoffice, e esse layout já está fechado a
 *    dobrar — pelo gate de `app/admin/layout.tsx` e pelo corte do `proxy.ts`.
 *    Quem chega a ver isto já passou a porta;
 *  • quem está no backoffice pode SEMPRE ver o site público — não há papel que
 *    o impeça, logo não há nada a filtrar.
 *
 * Por isso é um `<Link>` simples, sem `server-only` nem sessão. Também não é um
 * componente de servidor como o par: não lê nada que o exija, e o shell que o
 * hospeda (`BackofficeShell`, puxado por um `"use client"`) vai no bundle do
 * cliente — um `getCurrentUser()` aqui arrastava o driver do Postgres atrás.
 *
 * Discreto de propósito: mono, minúsculo, na cor da barra — é uma ferramenta
 * para quem trabalha nos dois lados o dia todo, não uma chamada à ação.
 */
export function SiteLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        // 44px de alvo de toque na altura (o mínimo do resto da barra); a seta
        // mais o texto dão largura de sobra, por isso não é preciso `min-w`. O
        // foco visível é o anel limão global (`:focus-visible`), não um `focus:`
        // local que divergisse do resto.
        "inline-flex min-h-11 shrink-0 items-center gap-2 font-mono text-2xs uppercase tracking-label text-bar-muted transition-colors hover:text-bar-foreground",
        className,
      )}
    >
      <ArrowLeft aria-hidden className="size-3.5 shrink-0" />
      <span>Ver site</span>
    </Link>
  );
}
