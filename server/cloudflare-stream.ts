import { requireEnv } from "@/lib/server-env";

/*
 * Live inputs da Cloudflare vistos do lado do backoffice: ler credenciais e
 * apagar. `lib/cloudflare.ts` (fundação) trata de criar e de assinar tokens de
 * reprodução — estas duas chamadas são só do backoffice e vivem aqui.
 *
 * Nada disto pode chegar ao browser: a stream key é a chave de casa da
 * transmissão. Quem chama garante o papel antes de pedir.
 */

function liveInputUrl(liveInputId: string): string {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${liveInputId}`;
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${requireEnv("CLOUDFLARE_STREAM_API_TOKEN")}` };
}

export type StreamCredentials = { rtmpsUrl: string; streamKey: string };

/**
 * Credenciais RTMPS do evento (para o OBS). Não vivem na nossa BD — vão-se
 * buscar à Cloudflare. Falha → `null`, e a página mostra o estado de erro em
 * vez de rebentar.
 */
export async function getStreamCredentials(liveInputId: string): Promise<StreamCredentials | null> {
  try {
    const res = await fetch(liveInputUrl(liveInputId), {
      headers: authHeader(),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { result: { rtmps: { url: string; streamKey: string } } };
    return { rtmpsUrl: data.result.rtmps.url, streamKey: data.result.rtmps.streamKey };
  } catch {
    return null;
  }
}

/**
 * Apaga o live input. Um input que fique para trás continua a contar na conta
 * da Cloudflare, por isso quem apaga um evento tem de saber se isto correu bem
 * — daí devolver booleano em vez de engolir o erro.
 *
 * 404 conta como sucesso: o objetivo era não existir, e já não existe.
 */
export async function deleteLiveInput(liveInputId: string): Promise<boolean> {
  try {
    const res = await fetch(liveInputUrl(liveInputId), {
      method: "DELETE",
      headers: authHeader(),
      cache: "no-store",
    });
    if (res.ok || res.status === 404) return true;

    console.error(
      `[cloudflare] apagar live input ${liveInputId}: ${res.status} ${await res.text()}`,
    );
    return false;
  } catch (error) {
    console.error(`[cloudflare] apagar live input ${liveInputId}:`, error);
    return false;
  }
}
