import { describe, expect, it } from "vitest";
import {
  checkImage,
  detectImageFormat,
  IMAGE_RULES,
  imageObjectKey,
  isImageKind,
  looksLikeSvg,
} from "@/components/admin/image-upload-rules";

/*
 * ============================================================================
 *  AS REGRAS DAS IMAGENS DE CANAL
 * ============================================================================
 *
 * A parte pura da defesa: o que é mesmo uma imagem, e que medidas servem.
 * Corre igual no browser e no servidor — e é por isso que se testa uma vez só.
 *
 * O que NÃO está aqui é tão importante como o que está: o veredito final é da
 * rota (`app/api/uploads/canal/route.ts`), que corre estas mesmas funções sobre
 * os bytes que chegaram e ainda passa por `sharp`. Ver
 * `tests/integracao/upload-de-imagens.test.ts` para o caminho todo.
 */

const bytes = (...valores: number[]) => new Uint8Array(valores);
const texto = (valor: string) => new TextEncoder().encode(valor);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
// Contentor RIFF: "RIFF" + 4 bytes de tamanho + "WEBP".
const WEBP = new Uint8Array([...texto("RIFF"), 0x24, 0, 0, 0, ...texto("WEBP")]);

describe("detectImageFormat — o tipo real, nunca a extensão", () => {
  it("reconhece PNG, JPEG e WebP pelos primeiros bytes", () => {
    expect(detectImageFormat(PNG)).toBe("png");
    expect(detectImageFormat(JPEG)).toBe("jpeg");
    expect(detectImageFormat(WEBP)).toBe("webp");
  });

  /*
   * O CASO QUE INTERESSA. Um ficheiro chamado "logo.png", anunciado como
   * `image/png`, com HTML lá dentro. A extensão e o `Content-Type` são texto
   * que quem envia escolhe; os bytes não.
   */
  it("recusa um ficheiro que só tem o NOME de imagem", () => {
    expect(detectImageFormat(texto("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectImageFormat(texto("GIF89a"))).toBeNull();
    expect(detectImageFormat(texto("%PDF-1.7"))).toBeNull();
    expect(detectImageFormat(new Uint8Array())).toBeNull();
  });

  /*
   * Um WAV também começa por "RIFF". Sem confirmar o "WEBP" nos bytes 8..11,
   * passava por imagem — e o `sharp` só se queixava depois.
   */
  it("não confunde outro contentor RIFF (um WAV) com um WebP", () => {
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45);
    expect(detectImageFormat(wav)).toBeNull();
  });

  it("um PNG truncado antes da assinatura completa não passa", () => {
    expect(detectImageFormat(bytes(0x89, 0x50, 0x4e))).toBeNull();
  });
});

describe("looksLikeSvg — para dizer PORQUÊ, não para decidir", () => {
  it("apanha o SVG com e sem declaração de XML à frente", () => {
    expect(looksLikeSvg(texto('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(true);
    expect(looksLikeSvg(texto('<?xml version="1.0"?>\n<!-- nota -->\n<SVG width="10">'))).toBe(
      true,
    );
  });

  it("um SVG com script é recusado na mesma — o formato é que não entra", () => {
    const hostil = texto(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/x")</script></svg>',
    );
    // A recusa não depende de detetar o script: o SVG não é PNG/JPEG/WebP.
    expect(detectImageFormat(hostil)).toBeNull();
    expect(looksLikeSvg(hostil)).toBe(true);
  });

  it("não chama SVG a um PNG", () => {
    expect(looksLikeSvg(PNG)).toBe(false);
  });
});

describe("checkImage — logo", () => {
  const ok = { width: 512, height: 512, bytes: 200_000 };

  it("aceita um quadrado dentro dos limites", () => {
    expect(checkImage("logo", ok)).toBeNull();
    expect(checkImage("logo", { width: 256, height: 256, bytes: 10_000 })).toBeNull();
    expect(checkImage("logo", { width: 1024, height: 1024, bytes: 10_000 })).toBeNull();
  });

  it("recusa o que não é quadrado, e diz as medidas que veio", () => {
    const queixa = checkImage("logo", { width: 512, height: 511, bytes: 10_000 });
    expect(queixa).toContain("512×511");
    expect(queixa).toContain("quadrado");
  });

  it("recusa abaixo do mínimo e acima do máximo", () => {
    expect(checkImage("logo", { width: 255, height: 255, bytes: 1000 })).toContain("256×256");
    expect(checkImage("logo", { width: 1025, height: 1025, bytes: 1000 })).toContain("1024×1024");
  });

  it("recusa acima de 1 MB e diz o peso que veio", () => {
    const queixa = checkImage("logo", { ...ok, bytes: IMAGE_RULES.logo.maxBytes + 1 });
    expect(queixa).toContain("1,0 MB");
  });
});

describe("checkImage — banner", () => {
  it("aceita 3:1 exacto e dentro da tolerância de 10%", () => {
    expect(checkImage("banner", { width: 1200, height: 400, bytes: 500_000 })).toBeNull();
    // 3,3:1 → 10% de desvio, o limite exacto.
    expect(checkImage("banner", { width: 1320, height: 400, bytes: 500_000 })).toBeNull();
    // 2,7:1 → 10% para o outro lado.
    expect(checkImage("banner", { width: 1350, height: 500, bytes: 500_000 })).toBeNull();
  });

  it("recusa fora da tolerância e diz a largura certa para aquela altura", () => {
    const queixa = checkImage("banner", { width: 1200, height: 800, bytes: 500_000 });
    expect(queixa).toContain("1200×800");
    // 800 × 3 = 2400: a resposta é acionável, não é "rácio inválido".
    expect(queixa).toContain("2400");
  });

  it("recusa abaixo do mínimo mesmo com o rácio certo", () => {
    expect(checkImage("banner", { width: 900, height: 300, bytes: 100_000 })).toContain("1200×400");
  });

  it("o banner não tem teto de dimensões — só de peso", () => {
    expect(checkImage("banner", { width: 6000, height: 2000, bytes: 2_000_000 })).toBeNull();
    expect(checkImage("banner", { width: 6000, height: 2000, bytes: 3_500_000 })).toContain(
      "3,0 MB",
    );
  });
});

describe("isImageKind", () => {
  it("só conhece logo e banner", () => {
    expect(isImageKind("logo")).toBe(true);
    expect(isImageKind("banner")).toBe(true);
    expect(isImageKind("avatar")).toBe(false);
    expect(isImageKind("__proto__")).toBe(false);
    expect(isImageKind(undefined)).toBe(false);
  });
});

describe("imageObjectKey — o nome é NOSSO", () => {
  it("nunca inclui o nome do ficheiro de quem carrega", () => {
    const chave = imageObjectKey({ channelId: "canal-1", kind: "logo", id: "id-1" });
    expect(chave).toBe("canais/canal-1/logo-id-1.webp");
  });

  it("dois carregamentos seguidos não se esmagam um ao outro", () => {
    const a = imageObjectKey({ channelId: "c", kind: "banner", id: "id-1" });
    const b = imageObjectKey({ channelId: "c", kind: "banner", id: "id-2" });
    expect(a).not.toBe(b);
  });

  it("o prefixo de testes não deixa barra a dobrar", () => {
    expect(imageObjectKey({ channelId: "c", kind: "logo", id: "x", prefix: "teste/" })).toBe(
      "teste/canais/c/logo-x.webp",
    );
  });
});
