import { importJWK, SignJWT } from "jose";
import { requireEnv } from "@/lib/server-env";

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

// Assina localmente um token de reprodução curto (JWT RS256) com a signing key
// da conta. Sem chamada à API por cada play (recomendado pela Cloudflare).
export async function signPlaybackToken(videoUid: string, ttlSeconds = 120): Promise<string> {
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
