import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CascaLegal, CorpoLegal } from "@/components/legal/pagina";
import { PAGINAS_LEGAIS, paginaLegal } from "@/lib/legal/paginas";
import { rotaLegal } from "@/lib/legal/tipos";

/*
 * As quatro páginas legais numa rota só.
 *
 * São quatro documentos com a mesma forma — cabeçalho, índice, secções — e por
 * isso partilham o renderizador em vez de terem quatro ficheiros quase iguais.
 * Acrescentar uma quinta (ex.: uma política de conteúdo autónoma) é acrescentar
 * uma entrada em `lib/legal/paginas.ts`: a rota, o índice, o rodapé e o sitemap
 * seguem sozinhos.
 */

export function generateStaticParams() {
  return PAGINAS_LEGAIS.map((pagina) => ({ pagina: pagina.slug }));
}

/*
 * Só existem os slugs de `PAGINAS_LEGAIS`. Com isto, `/legal/qualquer-coisa`
 * responde 404 antes de chegar a renderizar seja o que for — e responde-o com
 * o status certo, sem depender de um `notFound()` a meio de uma resposta já
 * começada.
 */
export const dynamicParams = false;

type Props = { params: Promise<{ pagina: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pagina: slug } = await params;
  const pagina = paginaLegal(slug);
  if (!pagina) return {};

  return {
    title: pagina.titulo,
    description: pagina.resumo,
    alternates: { canonical: rotaLegal(pagina.slug) },
    openGraph: {
      title: `${pagina.titulo} — FirstRow`,
      description: pagina.resumo,
      url: rotaLegal(pagina.slug),
      type: "article",
    },
  };
}

export default async function LegalPage({ params }: Props) {
  const { pagina: slug } = await params;
  const pagina = paginaLegal(slug);
  if (!pagina) notFound();

  return (
    <CascaLegal titulo={pagina.titulo} resumo={pagina.resumo}>
      <CorpoLegal pagina={pagina} />
    </CascaLegal>
  );
}
