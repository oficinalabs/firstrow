/*
 * ============================================================================
 *  MODELO DE CONTEÚDO DAS PÁGINAS LEGAIS
 * ============================================================================
 *
 * O texto legal vive em dados, não em JSX. Três razões:
 *
 *  1. Quem revê o texto (um advogado, não um programador) tem de conseguir ler
 *     e apontar alterações sem atravessar marcação.
 *  2. O índice de cada página, o sitemap e os links do rodapé saem todos daqui
 *     — acrescentar uma secção não obriga a lembrar-se de mais três sítios.
 *  3. Os marcadores `[VERIFICAR COM ADVOGADO]` e `[por preencher]` ficam
 *     visíveis e contáveis. São dívida assumida; escondê-los seria fingir que
 *     não existem.
 *
 * A fonte é `docs/legal/CONTEUDO-PAGINAS.md`. O texto aqui é cópia literal —
 * ajustes de quebra de parágrafo, sim; de sentido jurídico, nunca.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  MARCAÇÃO INLINE — três formas, e só três
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   **negrito**              → ênfase
 *   [texto](https://…)       → ligação
 *   [o que falta]            → marcador de valor por preencher
 *
 * Não há HTML cru em lado nenhum: o renderizador constrói nós de React a
 * partir destes três casos e mais nada. Texto legal não passa por
 * `dangerouslySetInnerHTML`.
 */

export type Bloco =
  /** Parágrafo corrente. */
  | { t: "p"; texto: string }
  /** Subtítulo dentro de uma secção (ex.: "Conta", "Compras"). */
  | { t: "sub"; texto: string }
  /** Linha discreta a seguir a um parágrafo (ex.: "Base legal: …"). */
  | { t: "nota"; texto: string }
  | { t: "lista"; itens: readonly string[]; numerada?: boolean }
  | { t: "tabela"; colunas: readonly string[]; linhas: readonly (readonly string[])[] }
  /** Bloco destacado com um ponto por confirmar juridicamente. */
  | { t: "advogado"; texto: string };

export type Seccao = {
  /** Âncora e entrada no índice. Estável: entra em links partilhados. */
  id: string;
  titulo: string;
  blocos: readonly Bloco[];
};

export type PaginaLegal = {
  /** Último segmento da rota: /legal/<slug>. */
  slug: string;
  titulo: string;
  /** Uma frase — serve de subtítulo e de `description` nos metadados. */
  resumo: string;
  /** Texto antes da primeira secção, quando o original o tem. Sem título. */
  intro?: readonly Bloco[];
  seccoes: readonly Seccao[];
};

/** A rota pública de uma página legal. Ninguém escreve o caminho à mão. */
export function rotaLegal(slug: string): string {
  return `/legal/${slug}`;
}

/**
 * A FAQ vive fora de `/legal` (quem procura "como pago?" não vai à secção
 * legal). Fica aqui, com as outras rotas, para o rodapé, o sitemap e as páginas
 * legais lhe chegarem sem importar um componente só por causa de uma string.
 */
export const ROTA_AJUDA = "/ajuda";
