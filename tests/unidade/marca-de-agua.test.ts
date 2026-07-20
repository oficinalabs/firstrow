import { describe, expect, it } from "vitest";
import {
  AREA_MINIMA,
  type Caixa,
  type EstadoDaMarca,
  molduraUtil,
  OPACIDADE_MINIMA,
  porqueFalha,
} from "@/components/player/watermark-check";

/*
 * ============================================================================
 *  O VIGIA DA MARCA DE ÁGUA — os limiares, um a um
 * ============================================================================
 *
 * Metade destes testes são sobre APANHAR quem esconde a marca. A outra metade,
 * a que interessa mais, é sobre NÃO apanhar quem não fez nada: um falso
 * positivo aqui corta o vídeo a um espectador que pagou, a meio de uma batalha
 * que não se repete. Entre deixar passar um segundo de marca escondida e parar
 * o vídeo a um cliente, o erro caro é o segundo — e é por isso que os limiares
 * estão escritos com folga e testados nos dois sentidos.
 *
 * Já houve aqui um engano deste feitio, encontrado a medir e não a ler: o vigia
 * saltava a verificação quando `document.hidden` era verdade. Num separador em
 * segundo plano — e no browser de teste, que reporta `hidden` sempre — apagar a
 * marca não tinha consequência nenhuma. O guarda que existia para evitar falsos
 * positivos estava, na prática, a desligar a defesa toda.
 */

const MOLDURA: Caixa = { left: 0, top: 0, width: 900, height: 506 };
const LABEL = "espectador@exemplo.pt";

/** Uma marca normal, no meio do vídeo, como ela é 99,9% do tempo. */
function marcaNormal(por: Partial<EstadoDaMarca> = {}): EstadoDaMarca {
  return {
    ligada: true,
    texto: `${LABEL} · FirstRow`,
    display: "inline-flex",
    visibility: "visible",
    opacidade: 0.3,
    caixa: { left: 120, top: 80, width: 240, height: 20 },
    moldura: MOLDURA,
    tapadaPor: null,
    ...por,
  };
}

describe("a marca intacta", () => {
  it("passa", () => {
    expect(porqueFalha(marcaNormal(), LABEL)).toBeNull();
  });

  it("passa em cada uma das cinco posições do salto", () => {
    // As percentagens de `wm-hop` em app/globals.css, sobre uma moldura 16:9.
    const posicoes = [
      [6, 12],
      [44, 68],
      [20, 30],
      [10, 78],
      [38, 46],
    ];
    for (const [left, top] of posicoes) {
      const estado = marcaNormal({
        caixa: {
          left: (MOLDURA.width * left) / 100,
          top: (MOLDURA.height * top) / 100,
          width: 240,
          height: 20,
        },
      });
      expect(porqueFalha(estado, LABEL), `posição ${left}%/${top}%`).toBeNull();
    }
  });

  it("passa num telemóvel, onde o vídeo é mais estreito do que a marca", () => {
    // 375px de largura: a marca transborda e o `overflow: hidden` corta-a.
    const telemovel: Caixa = { left: 0, top: 0, width: 375, height: 211 };
    const estado = marcaNormal({
      moldura: telemovel,
      caixa: { left: 165, top: 140, width: 240, height: 20 },
    });
    expect(porqueFalha(estado, LABEL)).toBeNull();
  });

  it("passa com a opacidade que o CSS lhe dá (0.30) e ainda com metade dela", () => {
    expect(porqueFalha(marcaNormal({ opacidade: 0.3 }), LABEL)).toBeNull();
    expect(porqueFalha(marcaNormal({ opacidade: 0.15 }), LABEL)).toBeNull();
  });
});

describe("as maneiras de a fazer desaparecer", () => {
  const casos: [string, Partial<EstadoDaMarca>, string][] = [
    ["apagar o nó", { ligada: false }, "removida"],
    ["display: none", { display: "none" }, "display-none"],
    ["visibility: hidden", { visibility: "hidden" }, "visibility"],
    ["opacity: 0", { opacidade: 0 }, "opacidade"],
    ["opacity quase nada", { opacidade: 0.05 }, "opacidade"],
    ["encolher até não se ver", { caixa: { left: 100, top: 100, width: 2, height: 2 } }, "tamanho"],
    [
      "empurrar para fora do ecrã",
      { caixa: { left: -9999, top: 80, width: 240, height: 20 } },
      "fora-do-enquadramento",
    ],
    [
      "empurrar para baixo do vídeo",
      { caixa: { left: 120, top: 4000, width: 240, height: 20 } },
      "fora-do-enquadramento",
    ],
    ["tapar com um div", { tapadaPor: "div" }, "tapada:div"],
    ["trocar o email por outro", { texto: "outra-pessoa@exemplo.pt · FirstRow" }, "texto-trocado"],
    ["esvaziar o texto", { texto: "" }, "texto-trocado"],
  ];

  for (const [nome, mudanca, esperado] of casos) {
    it(`apanha: ${nome}`, () => {
      expect(porqueFalha(marcaNormal(mudanca), LABEL)).toBe(esperado);
    });
  }

  it("apanha a marca só com um cantinho de fora do vídeo", () => {
    // 90% da marca fora da moldura — tecnicamente visível, na prática não.
    const estado = marcaNormal({ caixa: { left: 876, top: 80, width: 240, height: 20 } });
    expect(porqueFalha(estado, LABEL)).toBe("fora-do-enquadramento");
  });
});

describe("os limiares, no ponto exato onde viram", () => {
  it("a opacidade vira em OPACIDADE_MINIMA", () => {
    expect(porqueFalha(marcaNormal({ opacidade: OPACIDADE_MINIMA }), LABEL)).toBeNull();
    expect(porqueFalha(marcaNormal({ opacidade: OPACIDADE_MINIMA - 0.001 }), LABEL)).toBe(
      "opacidade",
    );
  });

  it("o tamanho vira em AREA_MINIMA", () => {
    const comArea = (area: number) =>
      marcaNormal({ caixa: { left: 100, top: 100, width: area / 10, height: 10 } });
    expect(porqueFalha(comArea(AREA_MINIMA), LABEL)).toBeNull();
    expect(porqueFalha(comArea(AREA_MINIMA - 10), LABEL)).toBe("tamanho");
  });
});

describe("a moldura sem tamanho", () => {
  /*
   * Quando o player não está desenhado (a página está a mudar de layout, o pai
   * está escondido), não há nada contra o que comparar. Quem chama tem de
   * perguntar isto ANTES de decidir — senão o vigia dispara por causa do nosso
   * próprio layout e corta o vídeo a quem não fez nada.
   */
  it("diz que não serve de referência", () => {
    expect(molduraUtil({ left: 0, top: 0, width: 0, height: 0 })).toBe(false);
    expect(molduraUtil({ left: 0, top: 0, width: 900, height: 0 })).toBe(false);
    expect(molduraUtil(MOLDURA)).toBe(true);
  });
});
