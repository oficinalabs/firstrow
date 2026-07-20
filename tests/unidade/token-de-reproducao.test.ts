import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { readDeviceId } from "@/app/api/playback/device";
import { PLAYBACK_TTL_SECONDS, signPlaybackToken, streamIframeUrl } from "@/lib/cloudflare";

/*
 * ============================================================================
 *  O TOKEN DE REPRODUÇÃO — o TTL, e o que ele tem de cobrir
 * ============================================================================
 *
 * O bug: TTL de 120 s, sem renovação. Mediu-se contra a Cloudflare, com a
 * gravação real, que o `exp` é revalidado A CADA SEGMENTO — um token de 45 s
 * dá 401 no segmento aos 65 s. Ou seja, os 120 s não eram uma folga: eram o
 * tempo máximo de vídeo que alguém conseguia ver de seguida.
 *
 * Estes testes não falam com a Cloudflare (a suite não depende da rede nem de
 * segredos). O que eles trancam é a decisão: o TTL cobre um evento inteiro, e
 * quem assina tem de dizer se é direto ou gravação.
 */

const HORA = 3600;

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

describe("o TTL do token de reprodução", () => {
  it("cobre um evento inteiro, e não dois minutos", () => {
    // O que se está a impedir: qualquer valor abaixo disto volta a pôr o
    // espectador a recarregar a meio de uma batalha.
    expect(PLAYBACK_TTL_SECONDS.live).toBeGreaterThanOrEqual(6 * HORA);
    expect(PLAYBACK_TTL_SECONDS.vod).toBeGreaterThanOrEqual(6 * HORA);
  });

  it("não é eterno — um link copiado tem de morrer no mesmo dia", () => {
    expect(PLAYBACK_TTL_SECONDS.live).toBeLessThanOrEqual(24 * HORA);
    expect(PLAYBACK_TTL_SECONDS.vod).toBeLessThanOrEqual(24 * HORA);
  });

  it("assina o recurso pedido com o prazo do tipo pedido", async () => {
    await comChaveDeTeste(async () => {
      const antes = Math.floor(Date.now() / 1000);
      const token = await signPlaybackToken("video-abc", "vod");
      const payload = decodeJwt(token);

      // `sub` é o recurso: assinar o live input para ver uma gravação dá um
      // token válido para a coisa errada — e o player fica em branco.
      expect(payload.sub).toBe("video-abc");
      expect(payload.exp).toBeGreaterThanOrEqual(antes + PLAYBACK_TTL_SECONDS.vod);
      expect(payload.exp).toBeLessThanOrEqual(antes + PLAYBACK_TTL_SECONDS.vod + 30);
    });
  });

  it("o direto e a gravação usam cada um o seu prazo", async () => {
    await comChaveDeTeste(async () => {
      const [live, vod] = await Promise.all([
        signPlaybackToken("uid", "live"),
        signPlaybackToken("uid", "vod"),
      ]);
      const dLive = decodeJwt(live);
      const dVod = decodeJwt(vod);

      expect((dLive.exp ?? 0) - (dLive.iat ?? 0)).toBe(PLAYBACK_TTL_SECONDS.live);
      expect((dVod.exp ?? 0) - (dVod.iat ?? 0)).toBe(PLAYBACK_TTL_SECONDS.vod);
    });
  });

  it("o token vai no caminho do iframe — é o mecanismo da Cloudflare", () => {
    expect(streamIframeUrl("abc.def.ghi")).toBe("https://iframe.cloudflarestream.com/abc.def.ghi");
  });
});

describe("o cookie de dispositivo", () => {
  const pedido = (cookie?: string) =>
    new Request("https://exemplo.test/api/playback/e/session", {
      headers: cookie ? { cookie } : {},
    });

  it("lê o dispositivo do cookie", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(readDeviceId(pedido(`outra=coisa; fr_dv=${id}`))).toBe(id);
  });

  it("sem cookie devolve null — é o primeiro play deste browser", () => {
    expect(readDeviceId(pedido())).toBeNull();
    expect(readDeviceId(pedido("sessao=abc"))).toBeNull();
  });

  /*
   * O valor vem do cliente e vai parar a uma coluna e a comparações. Um
   * dispositivo forjado só falseia a métrica de bloqueios (não abre vídeo
   * nenhum), mas lixo com aspeto de lixo não entra na base à mesma.
   */
  it("recusa o que não tem a forma de um identificador nosso", () => {
    expect(readDeviceId(pedido("fr_dv=; x=1"))).toBeNull();
    expect(readDeviceId(pedido("fr_dv=<script>alert(1)</script>"))).toBeNull();
    expect(readDeviceId(pedido("fr_dv=' or 1=1 --"))).toBeNull();
    expect(readDeviceId(pedido(`fr_dv=${"a".repeat(400)}`))).toBeNull();
  });
});
