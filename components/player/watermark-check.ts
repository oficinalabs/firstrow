/*
 * ============================================================================
 *  A MARCA DE ÁGUA ESTÁ MESMO NO ECRÃ? — a decisão, separada da leitura
 * ============================================================================
 *
 * Isto é só aritmética: recebe o que o DOM disse e responde o que está mal.
 * Quem lê o DOM é `watermark.tsx`; quem decide é este ficheiro.
 *
 * Estão separados por uma razão prática. A parte que lê depende de um browser
 * a sério (é ele que sabe o que é um `opacity` calculado ou quem está por cima
 * de quem); a parte que decide é onde vivem os enganos que custam caro — um
 * limiar apertado de mais corta o vídeo a quem pagou, um limiar largo de mais
 * deixa passar a marca escondida. Assim os limiares têm testes, um a um, sem
 * precisar de montar meio browser para os correr.
 */

export type Caixa = { left: number; top: number; width: number; height: number };

/**
 * O que o ecrã inteiro está a fazer à marca, num instante.
 *
 *  • `nenhum`      — não há elemento em ecrã inteiro. O caso normal.
 *  • `com-a-marca` — o elemento em ecrã inteiro CONTÉM a marca. É o que o nosso
 *                    botão faz: pede ecrã inteiro à moldura, e a marca, que
 *                    vive lá dentro, vai com ela. Verifica-se como sempre.
 *  • `sem-a-marca` — há um elemento em ecrã inteiro e a marca ficou de fora.
 *                    O elemento em ecrã inteiro é pintado na *top layer*, por
 *                    cima de tudo o resto: a marca continua a ter caixa,
 *                    opacidade e texto certos — só que ninguém a vê.
 *
 * A distinção importa porque `sem-a-marca` é o único estado em que TODAS as
 * outras medições mentem. Medir mais fundo não ajuda: a resposta já se sabe.
 */
export type EstadoDoEcraInteiro = "nenhum" | "com-a-marca" | "sem-a-marca";

/** O que o DOM disse sobre a marca, num instante. */
export type EstadoDaMarca = {
  /** O nó ainda está ligado ao documento? */
  ligada: boolean;
  /** O texto que está lá escrito agora. */
  texto: string;
  display: string;
  visibility: string;
  opacidade: number;
  caixa: Caixa;
  /** A moldura do player — a referência contra a qual tudo é comparado. */
  moldura: Caixa;
  /** Nome do elemento desenhado por cima da marca, se houver algum. */
  tapadaPor: string | null;
  /** O ecrã inteiro leva a marca com ele, ou deixa-a para trás? */
  ecraInteiro: EstadoDoEcraInteiro;
};

/** Abaixo disto a marca está a esconder-se — o CSS põe-na a 0.30. */
export const OPACIDADE_MINIMA = 0.12;

/** Área mínima em px²: uma marca de 2×2 é uma marca apagada com outro nome. */
export const AREA_MINIMA = 300;

/**
 * Fração da marca que tem de cair dentro da moldura.
 *
 * Um quarto, e não metade: num telemóvel a marca é quase tão larga como o
 * vídeo e o `overflow: hidden` corta-lhe legitimamente um bocado. Quem a quer
 * esconder manda-a para -9999px, e isso dá zero — a diferença entre um ataque
 * e um ecrã estreito é de ordem de grandeza, não de percentagem.
 */
export const FRACAO_DENTRO = 0.25;

/** Área da interseção de duas caixas. */
function sobreposicao(a: Caixa, b: Caixa): number {
  const x = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return x * y;
}

/**
 * A moldura tem tamanho? Sem isso não há nada para comparar — a página está a
 * mudar de layout, o pai foi escondido, o telemóvel rodou. É estado da página,
 * não ataque, e é por isso que quem chama tem de perguntar isto ANTES.
 */
export function molduraUtil(moldura: Caixa): boolean {
  return moldura.width >= 1 && moldura.height >= 1;
}

/**
 * O que está mal com a marca, ou `null` se está tudo bem.
 *
 * Cada teste corresponde a uma maneira concreta de a fazer desaparecer sem a
 * apagar: `display:none`, `visibility:hidden`, `opacity:0`, encolher,
 * empurrar para fora do vídeo, tapar com outro elemento, trocar o texto.
 * "Existe no DOM" não é a pergunta.
 */
export function porqueFalha(estado: EstadoDaMarca, label: string): string | null {
  if (!estado.ligada) return "removida";

  /*
   * ECRÃ INTEIRO SEM A MARCA — a decisão difícil deste ficheiro.
   *
   * Vem cedo porque, neste estado, todos os testes abaixo dão verde a mentir: o
   * elemento em ecrã inteiro é pintado na *top layer* e a marca continua com a
   * caixa, a opacidade e o texto de sempre, apenas invisível. Medir mais fundo
   * é medir uma marca que ninguém está a ver.
   *
   * PORQUÊ CORTAR, e não deixar passar. Depois de o player deixar de dar
   * `allowfullscreen` ao iframe, mediu-se que já não existe caminho legítimo
   * para aqui em nenhum motor de secretária ou Android:
   *   — o nosso botão põe a MOLDURA em ecrã inteiro, e a marca vai lá dentro;
   *   — o botão de ecrã inteiro do player da Cloudflare deixa de ser desenhado
   *     (o próprio player o esconde quando a política não lho permite);
   *   — `iframe.requestFullscreen()` a partir da página passa a ser recusado
   *     pelo browser ("Permissions check failed");
   *   — mais nada na aplicação chama a API de ecrã inteiro.
   * Sobra a consola do inspetor. Ou seja: chegar aqui é sinal de intenção, e a
   * regra das duas falhas seguidas continua a proteger de um engano isolado.
   *
   * O QUE ISTO **NÃO** É: o ecrã inteiro do BROWSER (F11, ou o botão verde do
   * macOS) não põe `fullscreenElement` nenhum — a página só fica maior e a
   * marca continua desenhada. Esse caso nunca passa por aqui, e é bom que não
   * passe: é comuníssimo e não é ataque nenhum.
   *
   * O QUE ISTO **NÃO COBRE**: o iPhone. Lá o vídeo vai para o leitor nativo do
   * sistema, que vive fora do DOM e não acende `fullscreenElement` nenhum na
   * nossa página — este teste nem chega a disparar. Não é uma omissão: é o que
   * não se consegue ver deste lado. Ver a nota em `watermark.tsx`.
   */
  if (estado.ecraInteiro === "sem-a-marca") return "fora-do-ecra-inteiro";

  // O texto é metade do valor da marca: sem o email, identifica quem?
  if (!estado.texto.includes(label)) return "texto-trocado";

  if (estado.display === "none") return "display-none";
  if (estado.visibility !== "visible") return "visibility";
  if (estado.opacidade < OPACIDADE_MINIMA) return "opacidade";

  const area = estado.caixa.width * estado.caixa.height;
  if (area < AREA_MINIMA) return "tamanho";

  if (sobreposicao(estado.caixa, estado.moldura) < area * FRACAO_DENTRO) {
    return "fora-do-enquadramento";
  }

  if (estado.tapadaPor) return `tapada:${estado.tapadaPor}`;

  return null;
}
