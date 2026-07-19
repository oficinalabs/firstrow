import Image from "next/image";
import { LinksLegais } from "@/components/legal/rodape";

/*
 * Rodapé do espectador (tema dark). Os links legais deixaram de ser texto morto
 * — são os mesmos do rodapé do marketing, por `LinksLegais`.
 *
 * Isto não é detalhe: quem compra um acesso e vê a live falhar entra por aqui,
 * não pelo site institucional. Se a política de reembolsos só existisse no
 * marketing, a pessoa que precisa dela era a única que não lhe chegava.
 */
export function ViewerFooter() {
  return (
    <footer className="mt-10 border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 md:px-8">
        <LinksLegais />
        <div className="mt-7 flex items-center gap-2 border-t border-border pt-5">
          <Image
            src="/brand/firstrow-icon-branco.svg"
            alt=""
            width={16}
            height={16}
            className="opacity-60"
          />
          <span className="font-mono text-2xs text-muted-foreground">
            © {new Date().getFullYear()} FirstRow
          </span>
        </div>
      </div>
    </footer>
  );
}
