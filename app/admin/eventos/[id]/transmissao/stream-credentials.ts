import "server-only";
import { requireEnv } from "@/lib/server-env";

/*
 * Guarda de build (ver lib/server-env.ts). Este é o ficheiro mais perigoso do
 * repositório: devolve a CHAVE DE STREAM RTMPS do evento.
 *
 * Uma chave de reprodução que fuja deixa uma pessoa VER de graça. Esta deixa
 * EMITIR: quem a tiver transmite para dentro do evento, e o que aparece no
 * ecrã de toda a gente que pagou passa a ser dele. Não é acesso indevido, é
 * sequestro da emissão em direto.
 *
 * O `masked` no <CopyField> da página é conforto visual, não proteção — o
 * valor vai à mesma no payload RSC para o browser de quem abrir a página. Por
 * isso o que protege isto a sério é o gate do servidor (`canManageEvents` no
 * layout do backoffice), e este import garante que o valor nunca é arrastado
 * para um bundle de cliente por acidente.
 */

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
