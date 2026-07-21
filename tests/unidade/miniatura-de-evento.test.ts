import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { eventThumbnailPath } from "@/components/eventos/program";
import { signedThumbnailUrl } from "@/server/cloudflare-stream";

/*
 * ============================================================================
 *  A MINIATURA DE UM CARTÃO — o caminho público e o URL assinado
 * ============================================================================
 *
 * Duas peças, e a fronteira entre elas é a defesa:
 *
 *   `eventThumbnailPath` corre no browser e devolve SÓ um caminho nosso, sem
 *   segredo. É o que vai ao `src` do cartão.
 *
 *   `signedThumbnailUrl` corre no servidor e devolve o URL da Cloudflare com o
 *   token. Esse token — medido contra a conta real — abre também o vídeo pago,
 *   por isso NUNCA pode chegar ao cliente; só o proxy da rota lhe toca.
 *
 * Estes testes não falam com a Cloudflare. O que trancam é: (1) o caminho
 * público não leva token nenhum, e (2) o token assinado é para o vídeo certo.
 */

/** Chave de teste, gerada uma vez e sem valor nenhum fora daqui. */
async function comChaveDeTeste<T>(corpo: () => Promise<T>): Promise<T> {
  const { generateKeyPair, exportJWK } = await import("jose");
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(privateKey);

  const antes = {
    id: process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID,
    jwk: process.env.CLOUDFLARE_STREAM_SIGNING_KEY_JWK,
  };
  process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID = "chave-de-teste";
  process.env.CLOUDFLARE_STREAM_SIGNING_KEY_JWK = Buffer.from(JSON.stringify(jwk)).toString(
    "base64",
  );
  try {
    return await corpo();
  } finally {
    process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID = antes.id;
    process.env.CLOUDFLARE_STREAM_SIGNING_KEY_JWK = antes.jwk;
  }
}

describe("eventThumbnailPath — o caminho que vai ao cartão", () => {
  it("aponta à nossa rota quando o evento tem gravação", () => {
    // Fora de /api de propósito — ver `eventThumbnailPath` e a rota.
    expect(eventThumbnailPath({ id: "evt_123", cfVodUid: "vod_abc" })).toBe(
      "/eventos/evt_123/thumbnail",
    );
  });

  it("é null sem gravação — o cartão fica com o placeholder", () => {
    expect(eventThumbnailPath({ id: "evt_123", cfVodUid: null })).toBeNull();
    expect(eventThumbnailPath({ id: "evt_123", cfVodUid: "" })).toBeNull();
  });

  it("NUNCA leva um token — é isto que impede a fuga do VOD no cartão público", () => {
    const caminho = eventThumbnailPath({ id: "evt_123", cfVodUid: "vod_abc" });
    // Um JWT tem dois pontos a separar três partes. O caminho público não pode
    // ter forma de token: se um dia alguém trocar isto por um URL da Cloudflare,
    // este teste fica vermelho antes de o token chegar a um browser.
    expect(caminho).not.toContain(".");
    expect(caminho).not.toContain("videodelivery");
    expect(caminho).not.toContain("cloudflarestream");
  });
});

describe("signedThumbnailUrl — o URL assinado, só do lado do servidor", () => {
  it("assina a miniatura do vídeo pedido, no domínio de entrega", async () => {
    await comChaveDeTeste(async () => {
      const url = signedThumbnailUrl("vod_xyz");
      const resolvido = new URL(await url);

      expect(resolvido.origin).toBe("https://videodelivery.net");
      expect(resolvido.pathname).toMatch(/\/thumbnails\/thumbnail\.jpg$/);

      // O primeiro segmento do caminho é o token, não o uid em claro.
      const token = resolvido.pathname.split("/")[1];
      expect(token.split(".")).toHaveLength(3); // é mesmo um JWT
      expect(decodeJwt(token).sub).toBe("vod_xyz"); // assinado para o vídeo certo
    });
  });

  it("pede a miniatura já dimensionada para o cartão (16:9)", async () => {
    await comChaveDeTeste(async () => {
      const params = new URL(await signedThumbnailUrl("vod_xyz")).searchParams;
      expect(params.get("width")).toBe("640");
      expect(params.get("height")).toBe("360");
      expect(params.get("fit")).toBe("crop");
    });
  });
});
