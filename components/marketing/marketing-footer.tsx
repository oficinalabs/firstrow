import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/components/marketing/dados";

/*
 * Rodapé do marketing (tema light). É por aqui que a apresentação (/sobre) e o
 * pitch (/criadores) ficam descobríveis — a raiz "/" é a visão geral dos canais.
 * Termos/Privacidade ainda não têm página (ver PR) — por agora só o que existe.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <div className="flex items-center gap-2">
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
        <nav aria-label="Ligações do rodapé" className="flex items-center gap-4">
          <Link
            href="/sobre"
            className="font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Sobre
          </Link>
          <Link
            href="/criadores"
            className="font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Para criadores
          </Link>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Suporte
          </a>
        </nav>
      </div>
    </footer>
  );
}
