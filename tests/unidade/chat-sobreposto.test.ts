import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type EstadoDaMarca, porqueFalha } from "@/components/player/watermark-check";

/*
 * ============================================================================
 *  O CHAT POR CIMA DO VÍDEO — e porque é que ele não pára a reprodução
 * ============================================================================
 *
 * Em ecrã inteiro a conversa passa a ser desenhada por cima do vídeo, dentro do
 * mesmo elemento que vai a ecrã inteiro (tem de ser: o sistema só desenha esse
 * elemento). Isso põe interface nossa no caminho de uma defesa que corta o
 * vídeo a quem TAPAR a marca de água — e essa defesa não foi desligada.
 *
 * A garantia é de ORDEM DE DESENHO, não de aritmética: a marca sobe a `Z_MARCA`
 * e o chat fica estritamente abaixo. Se se cruzarem, quem fica à frente é a
 * marca. "O chat calha noutro sítio" seria uma conta dependente da largura do
 * ecrã, do comprimento do email e de onde a animação parou — e contas dessas
 * partem-se em silêncio no dia em que alguém tem um email comprido.
 *
 * Estes testes leem o código-fonte, à maneira do teste da descrição do evento.
 * Não é elegante; é o que apanha a alteração de uma linha que reabre o buraco
 * sem partir teste nenhum de comportamento.
 */

const ler = (caminho: string) => readFileSync(caminho, "utf8");

const PALCO = ler("components/chat/palco-com-chat.tsx");
const PLAYER = ler("components/player/watch-player.tsx");
const MARCA = ler("components/player/watermark.tsx");
const PAINEL = ler("components/chat/chat-panel.tsx");

describe("a marca de água fica À FRENTE do chat sobreposto", () => {
  it("a camada da marca declara o seu z-index", () => {
    expect(MARCA).toMatch(/export const Z_MARCA = \d+/);
    expect(MARCA).toMatch(/style=\{\{ zIndex: Z_MARCA \}\}/);
  });

  it("o chat sobreposto deriva o seu z-index do da marca, e para baixo", () => {
    // Derivado, e não um número solto: dois números independentes acabam por
    // divergir, e a divergência aqui é o vídeo a parar a quem pagou.
    expect(PALCO).toMatch(/const Z_CHAT_SOBREPOSTO = Z_MARCA - 1;/);
    expect(PALCO).toMatch(/zIndex: Z_CHAT_SOBREPOSTO/);
  });

  /*
   * Um `transform`, `filter`, `opacity` ou `isolate` entre a marca e o palco
   * cria contexto de empilhamento e PRENDE a marca dentro da moldura: o
   * `z-index` dela deixa de se comparar com o do chat, o chat passa a ficar à
   * frente, e o vigia corta. É uma classe de utilidade de distância.
   */
  it("nada entre a marca e o palco cria contexto de empilhamento", () => {
    const PROIBIDAS =
      /\b(isolate|transform|filter|backdrop-blur|blur-|opacity-\d|scale-\d|rotate-\d|will-change)/;

    const moldura = PLAYER.match(/"relative overflow-hidden[^"]*"/)?.[0] ?? "";
    expect(moldura).not.toMatch(PROIBIDAS);

    // A caixa do vídeo dentro do palco: as duas hipóteses do ternário.
    const caixaDoVideo =
      PALCO.match(/dentro \? "absolute inset-0" : "[^"]*lg:row-start-1"/)?.[0] ?? "";
    expect(caixaDoVideo).not.toBe("");
    expect(caixaDoVideo).not.toMatch(PROIBIDAS);
  });

  it("o palco é que cria o contexto, para os z-index não fugirem para a página", () => {
    expect(PALCO).toMatch(/"isolate"/);
  });
});

describe("o ecrã inteiro continua a levar a marca com ele", () => {
  it("o alvo por omissão continua a ser a moldura", () => {
    expect(PLAYER).toMatch(/const alvo = alvoEcraInteiro \?\? frameRef;/);
    expect(PLAYER).toMatch(/<FullscreenButton alvo=\{alvo\} \/>/);
  });

  it("o palco aponta o ecrã inteiro a si próprio, que contém a moldura", () => {
    expect(PALCO).toMatch(/alvoEcraInteiro=\{palcoRef\}/);
    // O `WatchPlayer` é filho do elemento com `ref={palcoRef}` — se deixar de
    // ser, o vigia responde `sem-a-marca` e o vídeo pára. Aqui só se fixa que
    // a intenção continua escrita.
    expect(PALCO).toMatch(/ref=\{palcoRef\}/);
    expect(PALCO.indexOf("ref={palcoRef}")).toBeLessThan(PALCO.indexOf("<WatchPlayer"));
  });

  it("o vigia continua a cortar quem se põe MESMO à frente da marca", () => {
    // O contrário do que este trabalho faz: se um elemento chegar à frente da
    // marca, isto tem de continuar a ser uma paragem. Não se desligou nada.
    expect(porqueFalha(marcaNormal({ tapadaPor: "div" }), LABEL)).toBe("tapada:div");
    expect(porqueFalha(marcaNormal({ ecraInteiro: "sem-a-marca" }), LABEL)).toBe(
      "fora-do-ecra-inteiro",
    );
  });

  it("com o chat por BAIXO da marca, não há motivo para cortar", () => {
    // É este o estado medido no browser em ecrã inteiro, com o chat aberto por
    // cima do vídeo: ninguém à frente da marca, ecrã inteiro com a marca dentro.
    expect(porqueFalha(marcaNormal({ ecraInteiro: "com-a-marca", tapadaPor: null }), LABEL)).toBe(
      null,
    );
  });
});

describe("um só painel de conversa, em dois sítios", () => {
  it("o palco monta o `ChatPanel` uma vez, não uma por sítio", () => {
    expect(PALCO.match(/<ChatPanel/g)).toHaveLength(1);
  });

  it("a variação entre a coluna e o sobreposto é só de apresentação", () => {
    expect(PAINEL).toMatch(/export type VarianteChat = "coluna" \| "sobreposto";/);
    expect(PAINEL).toMatch(/const ALTURA_LISTA: Record<VarianteChat, string>/);
    expect(PAINEL).toMatch(/const MOLDURA: Record<VarianteChat, string>/);
  });

  /*
   * Regressão medida, não imaginada: com `md:max-h-none` a conversa perdia o
   * tecto aos 768px sem ganhar altura nenhuma em troca. Medido a 768×1024 com
   * 74 mensagens — painel de 1799px, lista sem scroll interno, documento a
   * 2599px. O tecto só pode sair onde a célula da grelha passa a ter altura
   * própria, e isso é a partir de `lg`.
   */
  it("a coluna só perde o tecto de altura a partir de `lg`", () => {
    // Só as CLASSES, e não o ficheiro todo: o `md:max-h-none` continua escrito
    // no comentário que explica porque é que saiu daqui.
    const classes = PAINEL.match(
      /const ALTURA_LISTA: Record<VarianteChat, string> = \{[^}]*\}/,
    )?.[0];
    expect(classes).toMatch(/coluna: "max-h-\[55dvh\] lg:max-h-none lg:flex-1"/);
    expect(classes).not.toMatch(/md:max-h-none/);
  });
});

describe("o interruptor do chat não rouba o teclado", () => {
  /*
   * A mesma guarda do `f` do ecrã inteiro, e aqui é ainda mais precisa de ser:
   * o painel que esta tecla abre TEM uma caixa de texto. Escrever "chavão" no
   * chat não pode fechar o chat a meio da palavra.
   */
  it("a tecla `c` é ignorada dentro de campos de texto", () => {
    const bloco = PALCO.match(/if \(e\.key !== "c"[\s\S]*?alternarChat\(\);/)?.[0] ?? "";
    expect(bloco).not.toBe("");
    expect(bloco).toContain('tag === "INPUT"');
    expect(bloco).toContain('tag === "TEXTAREA"');
    expect(bloco).toContain('tag === "SELECT"');
    expect(bloco).toContain("foco.isContentEditable");
  });

  it("a tecla `c` ignora combinações com modificador — o Ctrl+C continua a copiar", () => {
    expect(PALCO).toMatch(/if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return;/);
  });

  it("o interruptor diz o seu estado sem depender do desenho", () => {
    expect(PALCO).toMatch(/aria-pressed=\{ligado\}/);
    expect(PALCO).toMatch(/aria-keyshortcuts="c"/);
    // 44px de alvo, como o botão de ecrã inteiro ao lado.
    expect(PALCO).toMatch(/size-11/);
  });

  /*
   * Escondido por `opacity`, e nunca por `hidden` ou `visibility`: as duas
   * últimas tiram o botão do caminho do Tab, e um controlo que só existe para
   * quem passa o rato não existe para quem usa teclado nem para quem usa
   * telemóvel. O `focusin` do palco traz os controlos de volta antes de o botão
   * receber o foco.
   */
  it("os controlos escondidos continuam no caminho do teclado", () => {
    expect(PALCO).toMatch(/!controlosAVista && "pointer-events-none opacity-0"/);
    expect(PALCO).toMatch(/addEventListener\("focusin", mostrar\)/);
  });

  /*
   * Em ecrã inteiro o sistema só DESENHA o palco, mas o documento inteiro
   * continua navegável por teclado. Medido: com os controlos escondidos eram
   * precisos 10 Tabs para chegar ao interruptor, e os anteriores caíam em
   * elementos que não estão no ecrã. Com o resto da página `inert`, são 4 —
   * todos dentro do palco. E desfaz-se exactamente o que se marcou: um
   * varrimento geral apagaria o `inert` que o próprio chat usa quando está
   * desligado.
   */
  it("em ecrã inteiro, o resto da página sai do caminho do Tab", () => {
    expect(PALCO).toMatch(/const marcados: HTMLElement\[\] = \[\];/);
    expect(PALCO).toMatch(/irmao\.inert = true;/);
    expect(PALCO).toMatch(/for \(const el of marcados\) el\.inert = false;/);
    // Guarda contra marcar o que já estava marcado — senão a limpeza desligava
    // o `inert` do chat fechado.
    expect(PALCO).toMatch(/irmao\.inert\) continue;/);
  });

  it("o auto-esconder só existe onde há rato", () => {
    // Num ecrã táctil não há hover para os trazer de volta, e o vídeo é um
    // iframe de outro domínio: um toque nele nem chega a esta página.
    expect(PALCO).toMatch(/matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/);
  });

  it("com o chat aberto há sempre um botão de fechar à vista", () => {
    expect(PAINEL).toMatch(/aria-label="Fechar o chat"/);
    expect(PALCO).toMatch(/onFechar=\{dentro \? alternarChat : undefined\}/);
  });
});

// ── apoio ───────────────────────────────────────────────────────────────────

const LABEL = "espectador@exemplo.pt";

/** Uma marca normal, como ela é 99,9% do tempo. */
function marcaNormal(por: Partial<EstadoDaMarca> = {}): EstadoDaMarca {
  return {
    ligada: true,
    texto: `${LABEL} · FirstRow`,
    display: "inline-flex",
    visibility: "visible",
    opacidade: 0.3,
    caixa: { left: 120, top: 108, width: 270, height: 73 },
    moldura: { left: 0, top: 0, width: 1280, height: 720 },
    tapadaPor: null,
    ecraInteiro: "nenhum",
    ...por,
  };
}
