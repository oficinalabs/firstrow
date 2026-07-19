import Link from "next/link";
import { EMAIL_SUPORTE } from "@/lib/legal/decisoes";
import { PAGINAS_LEGAIS } from "@/lib/legal/paginas";
import { ROTA_AJUDA, rotaLegal } from "@/lib/legal/tipos";

/*
 * Os links legais do rodapé — um bloco, dois rodapés.
 *
 * O do marketing é claro e o do espectador é escuro, mas os links têm de ser os
 * mesmos nos dois: um utilizador que só vê a app nunca passa pelo marketing, e
 * é precisamente ele que precisa de encontrar a política de reembolsos quando
 * uma live falha. Como tudo aqui usa tokens semânticos (`text-muted-foreground`,
 * `border-border`), o mesmo componente lê-se bem nos dois temas.
 *
 * As quatro páginas legais saem de `PAGINAS_LEGAIS` — acrescentar uma quinta
 * não obriga a lembrar-se do rodapé.
 */

const LIGACAO = "font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground";

export function LinksLegais() {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:gap-10">
      <Grupo titulo="Legal">
        {PAGINAS_LEGAIS.map((pagina) => (
          <li key={pagina.slug}>
            <Link href={rotaLegal(pagina.slug)} className={LIGACAO}>
              {curto(pagina.titulo)}
            </Link>
          </li>
        ))}
      </Grupo>

      <Grupo titulo="Ajuda">
        <li>
          <Link href={ROTA_AJUDA} className={LIGACAO}>
            Perguntas frequentes
          </Link>
        </li>
        <li>
          {/* Suporte ao cliente = suporte@arestadigital.pt (ver decisoes.ts).
              É diferente do ola@ do marketing, que é contacto B2B de criadores. */}
          <a href={`mailto:${EMAIL_SUPORTE}`} className={LIGACAO}>
            Suporte
          </a>
        </li>
        <li>
          {/*
           * O Livro de Reclamações Eletrónico ainda não está registado — o link
           * oficial é um `[DEFINIR]` na secção de litígios dos Termos. Aponta
           * para lá, onde isso está escrito, em vez de mandar as pessoas para
           * livroreclamacoes.pt a fingir que já lá estamos.
           */}
          <Link href={`${rotaLegal("termos")}#litigios`} className={LIGACAO}>
            Livro de Reclamações
          </Link>
        </li>
      </Grupo>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <nav aria-label={titulo}>
      <p className="font-mono text-2xs font-semibold uppercase tracking-label text-foreground-secondary">
        {titulo}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">{children}</ul>
    </nav>
  );
}

/** "Política de Privacidade" → "Privacidade". Um rodapé não é um índice. */
function curto(titulo: string): string {
  return titulo
    .replace(/^Política de /, "")
    .replace(/^Termos e Condições de Utilização$/, "Termos e Condições")
    .replace(/ e Cancelamentos$/, "");
}
