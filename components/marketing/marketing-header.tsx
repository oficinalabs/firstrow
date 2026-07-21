import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/*
 * Barra de topo do marketing: moldura FirstRow (tinta, independente do tema).
 * data-theme="dark" no header inverte só o botão de ação (fica claro sobre a
 * barra, como no design); os tokens bar-* são iguais nos dois temas.
 * `minimal` (404/erro): só lockup + "Entrar".
 */
export function MarketingHeader({ minimal = false }: { minimal?: boolean }) {
  return (
    <header data-theme="dark" className="bg-bar text-bar-foreground">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:px-8">
        <Link
          href="/sobre"
          aria-label="FirstRow — início"
          className="alvo-toque flex shrink-0 items-center"
        >
          <Image
            src="/brand/firstrow-lockup-h-branco.svg"
            alt="FirstRow"
            width={99}
            height={24}
            priority
          />
        </Link>
        {minimal ? (
          <Link href="/entrar" className="alvo-toque text-sm font-medium text-bar-foreground">
            Entrar
          </Link>
        ) : (
          <nav aria-label="Navegação de marketing" className="flex items-center gap-5 md:gap-6">
            <Link
              href="/"
              className="alvo-toque hidden text-sm font-medium text-bar-muted transition-colors hover:text-bar-foreground sm:inline"
            >
              Explorar canais
            </Link>
            <Link
              href="/criadores"
              className="alvo-toque hidden text-sm font-medium text-bar-muted transition-colors hover:text-bar-foreground sm:inline"
            >
              Para criadores
            </Link>
            {/* Entrar/Criar conta ficam sempre visíveis: são as ações da barra.
                Os links de navegação têm saída pelo rodapé e pela banda de CTA. */}
            <Link href="/entrar" className="alvo-toque text-sm font-medium text-bar-foreground">
              Entrar
            </Link>
            <Link href="/registar" className={buttonVariants({ size: "sm" })}>
              Criar conta
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
