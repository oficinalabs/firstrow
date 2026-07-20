import Link from "next/link";
import { Blocos } from "@/components/legal/blocos";
import { ATUALIZADO_EM, PAGINAS_LEGAIS } from "@/lib/legal/paginas";
import { type PaginaLegal, ROTA_AJUDA, rotaLegal } from "@/lib/legal/tipos";

/*
 * Invólucro de leitura das páginas legais e da ajuda.
 *
 * Uma só medida (`max-w-2xl`, ~70 caracteres por linha) para todas: é o que
 * torna um documento de 3000 palavras legível num telemóvel sem obrigar a
 * varrer o ecrã de um lado ao outro.
 */

/** A partir de quantas secções vale a pena ter índice. */
const SECCOES_PARA_INDICE = 5;

export function CascaLegal({
  titulo,
  resumo,
  children,
}: {
  titulo: string;
  resumo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 md:py-14">
      <header className="border-b-2 border-foreground pb-5">
        <h1 className="font-display text-2xl font-extrabold tracking-display text-balance md:text-3xl">
          {titulo}
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-foreground-secondary">{resumo}</p>
        <p className="mt-3.5 font-mono text-2xs uppercase tracking-label text-muted-foreground">
          Última atualização: {ATUALIZADO_EM}
        </p>
      </header>
      {children}
      <OutrasPaginas atual={titulo} />
    </div>
  );
}

/**
 * O aviso que evita que estas páginas prometam mais do que valem.
 *
 * O texto foi pesquisado, não foi revisto por advogado, e há decisões de
 * negócio por tomar. Dizê-lo em cima custa três linhas; não o dizer custa a
 * confiança de quem depois encontra um `[suporte@]` a meio de um parágrafo.
 */
export function AvisoRascunho() {
  return (
    <div className="mt-6 rounded-sm border border-border bg-muted/50 p-3.5">
      <p className="text-2sm leading-relaxed text-foreground-secondary">
        Este texto foi escrito com base em pesquisa jurídica e ainda aguarda revisão por advogado. O
        que aparece marcado assim —{" "}
        <span className="rounded-xs bg-muted px-1 font-mono text-2sm text-muted-foreground">
          [exemplo]
        </span>{" "}
        — são valores por preencher, e os blocos com{" "}
        <span className="font-mono text-2xs font-semibold uppercase tracking-label">
          [VERIFICAR COM ADVOGADO]
        </span>{" "}
        são pontos por confirmar. Preferimos deixá-los à vista a fingir que já estão decididos.
      </p>
    </div>
  );
}

/**
 * Índice recolhido por omissão.
 *
 * Nos Termos são catorze secções: aberto, empurrava o primeiro parágrafo para
 * fora do ecrã de um telemóvel. Recolhido, quem quer saltar abre-o; quem quer
 * ler começa a ler. É `<details>` nativo — funciona sem JavaScript e responde
 * ao teclado sem nos lembrarmos disso.
 */
function Indice({ pagina }: { pagina: PaginaLegal }) {
  if (pagina.seccoes.length < SECCOES_PARA_INDICE) return null;

  return (
    <details className="mt-6 rounded-sm border border-border">
      <summary className="cursor-pointer list-none px-3.5 py-3 font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        Nesta página · {pagina.seccoes.length} secções
      </summary>
      <nav aria-label={`Índice de ${pagina.titulo}`} className="border-t border-border px-3.5 py-3">
        <ol className="flex list-inside list-decimal flex-col gap-1.5 marker:font-mono marker:text-2xs marker:text-muted-foreground">
          {pagina.seccoes.map((seccao) => (
            <li key={seccao.id}>
              <Link
                href={`${rotaLegal(pagina.slug)}#${seccao.id}`}
                className="text-2sm text-foreground-secondary underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
              >
                {seccao.titulo}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}

/** Uma página legal inteira: aviso, índice, intro e secções. */
export function CorpoLegal({ pagina }: { pagina: PaginaLegal }) {
  return (
    <>
      <AvisoRascunho />
      <Indice pagina={pagina} />

      {pagina.intro ? (
        <div className="mt-8">
          <Blocos blocos={pagina.intro} />
        </div>
      ) : null}

      {pagina.seccoes.map((seccao) => (
        <section key={seccao.id} className="mt-9 scroll-mt-8" id={seccao.id}>
          <h2 className="font-display text-xl font-bold tracking-display text-balance">
            {seccao.titulo}
          </h2>
          <div className="mt-3">
            <Blocos blocos={seccao.blocos} />
          </div>
        </section>
      ))}
    </>
  );
}

/** Saída para as irmãs: ninguém chega a uma página legal e fica lá preso. */
function OutrasPaginas({ atual }: { atual: string }) {
  const outras = PAGINAS_LEGAIS.filter((p) => p.titulo !== atual);

  return (
    <nav aria-label="Outras páginas legais" className="mt-12 border-t border-border pt-5">
      <p className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        Ver também
      </p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {outras.map((p) => (
          <li key={p.slug}>
            <Link
              href={rotaLegal(p.slug)}
              className="text-2sm text-foreground-secondary underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
            >
              {p.titulo}
            </Link>
          </li>
        ))}
        {atual === "Perguntas frequentes" ? null : (
          <li>
            <Link
              href={ROTA_AJUDA}
              className="text-2sm text-foreground-secondary underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
            >
              Perguntas frequentes
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
