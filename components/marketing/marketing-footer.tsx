import Image from "next/image";
import Link from "next/link";
import { LinksLegais } from "@/components/legal/rodape";

/*
 * Rodapé do marketing (tema light). É por aqui que a apresentação (/sobre) e o
 * pitch (/criadores) ficam descobríveis — a raiz "/" é a visão geral dos canais.
 * As páginas legais e a ajuda entram por `LinksLegais`, partilhado com o rodapé
 * do espectador para os dois nunca divergirem.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-7 sm:flex-row sm:justify-between sm:gap-10">
          <nav aria-label="FirstRow">
            <p className="font-mono text-2xs font-semibold uppercase tracking-label text-foreground-secondary">
              FirstRow
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              <li>
                <Link
                  href="/sobre"
                  className="font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sobre
                </Link>
              </li>
              <li>
                <Link
                  href="/criadores"
                  className="font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Para criadores
                </Link>
              </li>
            </ul>
          </nav>

          <LinksLegais />
        </div>

        <div className="mt-8 flex items-center gap-2 border-t border-border pt-5">
          <Image
            src="/brand/firstrow-icon-tinta.svg"
            alt=""
            width={16}
            height={16}
            className="opacity-60"
          />
          <span className="font-mono text-2xs text-muted-foreground">
            © 2026 FirstRow · joinfirstrow.com
          </span>
        </div>
      </div>
    </footer>
  );
}
