import { requireEnv } from "@/lib/server-env";

export type StreamCredentials = { rtmpsUrl: string; streamKey: string };

// As credenciais RTMPS não ficam na nossa BD — vão-se buscar à Cloudflare
// pelo live input do evento. lib/cloudflare.ts (fundação) só cria inputs;
// este GET é do backoffice e vive aqui. Falha → null (a página mostra o
// estado de erro em vez de rebentar).
export async function getStreamCredentials(liveInputId: string): Promise<StreamCredentials | null> {
  try {
    const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
    const apiToken = requireEnv("CLOUDFLARE_STREAM_API_TOKEN");

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${liveInputId}`,
      { headers: { Authorization: `Bearer ${apiToken}` }, cache: "no-store" },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      result: { rtmps: { url: string; streamKey: string } };
    };
    return { rtmpsUrl: data.result.rtmps.url, streamKey: data.result.rtmps.streamKey };
  } catch {
    return null;
  }
}
