import "server-only";
import { importJWK, SignJWT } from "jose";
import { requireEnv } from "@/lib/server-env";

/*
 * Guarda de build (ver lib/server-env.ts): aqui vivem o token da API da
 * Cloudflare e a chave privada que assina os tokens de reprodução. A chave
 * assina QUALQUER vídeo da conta — se sair daqui, todo o catálogo pago fica
 * aberto e nem sequer se dá por isso, porque a validação acontece no edge da
 * Cloudflare e nunca passa pelos nossos logs.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

type CfResult<T> = { success: boolean; errors: unknown[]; result: T };

export type LiveInput = {
  uid: string;
  rtmpsUrl: string;
  streamKey: string;
};

// Cria um live input (ingest RTMPS para OBS), com gravação automática de VOD
// e acesso protegido por signed URLs.
export async function createLiveInput(name: string): Promise<LiveInput> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnv("CLOUDFLARE_STREAM_API_TOKEN");

  const res = await fetch(`${API_BASE}/accounts/${accountId}/stream/live_inputs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meta: { name },
      recording: { mode: "automatic", requireSignedURLs: true },
    }),
  });

  if (!res.ok) {
    throw new Error(`Cloudflare live input falhou: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as CfResult<{
    uid: string;
    rtmps: { url: string; streamKey: string };
  }>;

  return {
    uid: data.result.uid,
    rtmpsUrl: data.result.rtmps.url,
    streamKey: data.result.rtmps.streamKey,
  };
}

/** Que recurso é que este token vai abrir: o direto ou a gravação. */
export type PlaybackKind = "live" | "vod";

/*
 * ============================================================================
 *  QUANTO TEMPO VALE UM TOKEN DE REPRODUÇÃO — e porque é que já não são 120 s
 * ============================================================================
 *
 * O QUE SE MEDIU (20/07/2026, contra a gravação real d4714203…):
 *
 *   token de 45 s → t+0s : manifest 200, segmento 200
 *                   t+65s: manifest 401, segmento 401  ("signature expired")
 *
 * Isto responde à pergunta que estava em aberto no `docs/SEGURANCA-APP.md`
 * (ponto 5): a Cloudflare **revalida o `exp` a cada segmento**, não só na
 * primeira chamada. O `exp` viaja dentro do próprio URL do segmento. Ou seja,
 * um token de 120 s não dava 120 s de tolerância — dava 120 s de vídeo, e
 * depois o player morria a meio. Foi exatamente o que se viu no teste real:
 * sessões de ~141 s em cadeia, cada uma a nascer segundos depois de a anterior
 * ser cortada. Numa batalha de 3 h seriam ~90 interrupções por espectador.
 *
 * PORQUÊ UM TTL LONGO E NÃO UMA RENOVAÇÃO A MEIO: o token vive no URL do
 * iframe da Cloudflare. Renovar obriga a trocar o `src` do iframe, e trocar o
 * `src` **reinicia o vídeo do princípio** — no direto perde-se o directo, no
 * VOD perde-se a posição. Não há renovação silenciosa possível com o player
 * em iframe. Logo, o token tem de cobrir a sessão inteira à primeira.
 *
 * O TTL NÃO É A DEFESA ANTI-PIRATARIA, e nunca foi. Quem defende é:
 * login obrigatório, direito comprado verificado no mint, uma sessão por
 * conta (agora por dispositivo, ver `server/playback.ts`) e a marca de água
 * por espectador. O que o TTL decide é só uma coisa: **durante quanto tempo
 * um link copiado do inspetor continua a servir**. E aí a diferença entre 2
 * minutos e 12 horas é menor do que parece — quem quer redistribuir monta um
 * relé que remota o token de 2 em 2 minutos, custa 20 linhas. O que os 120 s
 * garantiam mesmo era só uma coisa: que ninguém conseguia ver o que comprou.
 *
 * OS NÚMEROS, e o pior caso de cada um:
 *
 *   live — o espectador abre a página antes da hora, a liga atrasa-se, a
 *          batalha arrasta-se: portas às 20 h, fim às 3 h da manhã. Um corte
 *          aqui não se recupera (o momento passou), por isso o TTL cobre a
 *          noite inteira com folga.
 *   vod  — o arquivo tem peças longas (há uma maratona de 8 h no catálogo) e
 *          quem vê gravado faz pausas. Um corte aqui recupera-se (recarregar
 *          e avançar), mas continua a ser uma interrupção.
 *
 * Os dois piores casos aterram no mesmo sítio, por isso o valor é o mesmo —
 * ficam separados porque são perguntas diferentes e um dia podem divergir.
 *
 * A Cloudflare aceita estes valores: medido a 12 h, 24 h e 48 h, todos 200.
 * (Não é preciso ir a 24 h: 12 h já cobre o pior caso e é menos tempo de vida
 * para um link copiado.)
 */
export const PLAYBACK_TTL_SECONDS: Record<PlaybackKind, number> = {
  live: 12 * 60 * 60,
  vod: 12 * 60 * 60,
};

/*
 * Assina localmente um token de reprodução (JWT RS256) com a signing key da
 * conta. Sem chamada à API por cada play (recomendado pela Cloudflare).
 *
 * O `kind` é OBRIGATÓRIO de propósito: o valor por omissão que aqui estava
 * (120 s) foi o que pôs a plataforma a cortar toda a gente aos dois minutos.
 * Quem assina tem de dizer o que está a assinar.
 */
export async function signPlaybackToken(videoUid: string, kind: PlaybackKind): Promise<string> {
  const ttlSeconds = PLAYBACK_TTL_SECONDS[kind];
  const keyId = requireEnv("CLOUDFLARE_STREAM_SIGNING_KEY_ID");
  const jwkB64 = requireEnv("CLOUDFLARE_STREAM_SIGNING_KEY_JWK");

  const jwk = JSON.parse(Buffer.from(jwkB64, "base64").toString("utf8"));
  const key = await importJWK(jwk, "RS256");

  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ kid: keyId })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setSubject(videoUid)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

export function streamIframeUrl(token: string): string {
  return `https://iframe.cloudflarestream.com/${token}`;
}
