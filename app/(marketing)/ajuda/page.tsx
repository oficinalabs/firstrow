import type { Metadata } from "next";
import Link from "next/link";
import { Blocos } from "@/components/legal/blocos";
import { AvisoRascunho, CascaLegal } from "@/components/legal/pagina";
import { FAQ, NOTA_DEFINIR } from "@/lib/legal/faq";
import { ROTA_AJUDA } from "@/lib/legal/tipos";

/*
 * FAQ — duas partes, dois públicos.
 *
 * Fica em `/ajuda` e não debaixo de `/legal`: quem procura "como é que eu pago"
 * não vai à secção legal do site. As páginas legais ligam para cá e o rodapé
 * mostra as duas coisas lado a lado.
 */

const RESUMO =
  "Como se paga, o que acontece se algo falhar, e o que as ligas precisam de saber antes do primeiro evento.";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description: RESUMO,
  alternates: { canonical: ROTA_AJUDA },
  openGraph: {
    title: "Perguntas frequentes — FirstRow",
    description: RESUMO,
    url: ROTA_AJUDA,
    type: "article",
  },
};

export default function AjudaPage() {
  return (
    <CascaLegal titulo="Perguntas frequentes" resumo={RESUMO}>
      <AvisoRascunho />

      {/* Duas partes, dois públicos: quem compra não devia ter de passar pelas
          perguntas das ligas para chegar às suas, e vice-versa. */}
      <nav aria-label="Partes da FAQ" className="mt-6 flex flex-wrap gap-2">
        {FAQ.map((parte) => (
          <Link
            key={parte.id}
            href={`${ROTA_AJUDA}#${parte.id}`}
            className="alvo-toque rounded-sm border border-input px-3 py-1.5 text-2sm font-medium text-foreground-secondary transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {parte.titulo}
          </Link>
        ))}
      </nav>

      {FAQ.map((parte) => (
        <section key={parte.id} id={parte.id} className="mt-10 scroll-mt-8">
          <h2 className="font-display text-xl font-bold tracking-display">{parte.titulo}</h2>
          <p className="mt-1.5 text-2sm text-muted-foreground">{parte.resumo}</p>

          <div className="mt-5 flex flex-col gap-7">
            {parte.perguntas.map((pergunta, ordem) => (
              <div key={pergunta.id} id={`${parte.id}-${pergunta.id}`} className="scroll-mt-8">
                <h3 className="flex gap-2.5 font-display text-base font-bold text-balance">
                  <span
                    aria-hidden
                    className="shrink-0 font-mono text-2xs font-medium tracking-label text-muted-foreground"
                  >
                    {String(ordem + 1).padStart(2, "0")}
                  </span>
                  {pergunta.pergunta}
                </h3>
                {/* Alinha a resposta com o texto da pergunta, não com o número. */}
                <div className="mt-2 pl-6">
                  <Blocos blocos={pergunta.resposta} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-10 border-l-2 border-foreground pl-4 text-2sm leading-relaxed text-muted-foreground">
        {NOTA_DEFINIR}
      </p>
    </CascaLegal>
  );
}
