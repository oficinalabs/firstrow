import { signPlaybackToken } from "@/lib/cloudflare";
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

export type StreamAccountStatus = {
  /** `false` quando a conta não consegue receber transmissões. */
  podeTransmitir: boolean;
  minutosUsados: number;
  /** Minutos contratados. `0` = sem subscrição de Stream. */
  minutosLimite: number;
};

/*
 * ============================================================================
 *  A CONTA CLOUDFLARE CONSEGUE MESMO RECEBER UMA TRANSMISSÃO?
 * ============================================================================
 *
 * Ter credenciais não chega. O Cloudflare Stream é um produto PAGO e sem plano
 * gratuito: numa conta sem subscrição, a API deixa criar live inputs à mesma
 * (são metadados) e devolve URL e chave com bom aspeto — mas o ingest é
 * RECUSADO. É uma armadilha silenciosa das piores.
 *
 * Custou duas horas a descobrir. O OBS e o Streamlabs falhavam os dois com
 * "disconnected, attempting to reconnect", a rede estava boa, as credenciais
 * estavam certas, e a Cloudflare não registava uma única tentativa. A única
 * pista era `totalStorageMinutesLimit: 0` num endpoint que ninguém pensa em ver.
 *
 * Por isso esta pergunta passa a ser feita no ecrã onde se vai buscar a chave,
 * ANTES de alguém ir lutar com o software de streaming.
 *
 * Falha → `null`: isto é um diagnóstico, não uma guarda. Se a Cloudflare não
 * responder, o ecrã mostra as credenciais na mesma — nunca se bloqueia uma
 * transmissão por causa de uma verificação que não conseguiu correr.
 */
export async function getStreamAccountStatus(): Promise<StreamAccountStatus | null> {
  try {
    const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/storage-usage`,
      { headers: authHeader(), cache: "no-store" },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      success?: boolean;
      result?: { totalStorageMinutes?: number; totalStorageMinutesLimit?: number };
    };
    if (!data.success || !data.result) return null;

    const minutosLimite = data.result.totalStorageMinutesLimit ?? 0;
    return {
      podeTransmitir: minutosLimite > 0,
      minutosUsados: data.result.totalStorageMinutes ?? 0,
      minutosLimite,
    };
  } catch {
    return null;
  }
}

/*
 * ============================================================================
 *  A GRAVAÇÃO DE UMA TRANSMISSÃO QUE JÁ ACABOU
 * ============================================================================
 *
 * A Cloudflare grava sozinha (o live input é criado com `mode: automatic`) mas
 * não nos diz nada: a gravação fica lá, com um uid próprio, e cabe-nos ir
 * buscá-la. Sem este passo o vídeo existe e a plataforma nunca sabe dele — foi
 * exatamente o que aconteceu na primeira transmissão real, com a gravação
 * pronta na Cloudflare e o arquivo vazio.
 *
 * Devolve a gravação MAIS RECENTE e só quando está pronta a ver. Uma
 * transmissão que caia e volte deixa várias gravações no mesmo live input; a
 * última é a que interessa. E o processamento demora — pedir demasiado cedo
 * devolve uma gravação que ainda não toca, e ligá-la assim dava um arquivo com
 * um vídeo partido.
 */
export type Recording = { uid: string; duracaoSegundos: number };

export async function getLatestRecording(liveInputId: string): Promise<Recording | null> {
  try {
    const res = await fetch(`${liveInputUrl(liveInputId)}/videos`, {
      headers: authHeader(),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      result?: { uid: string; duration?: number; readyToStream?: boolean; created?: string }[];
    };
    const prontas = (data.result ?? []).filter((v) => v.readyToStream);
    if (prontas.length === 0) return null;

    const maisRecente = prontas.reduce((a, b) => ((a.created ?? "") >= (b.created ?? "") ? a : b));
    return { uid: maisRecente.uid, duracaoSegundos: Math.round(maisRecente.duration ?? 0) };
  } catch (error) {
    console.error(`[cloudflare] gravações de ${liveInputId}:`, error);
    return null;
  }
}

/*
 * ============================================================================
 *  A MINIATURA (THUMBNAIL) DE UMA GRAVAÇÃO — e porque NUNCA vai ao browser
 * ============================================================================
 *
 * A Cloudflare gera a miniatura a partir do próprio vídeo. O QUE SE MEDIU
 * (21/07/2026, contra a gravação real d4714203…, que é criada com
 * `requireSignedURLs: true` como todas — ver `lib/cloudflare.ts`):
 *
 *   videodelivery.net/<uid>/thumbnails/thumbnail.jpg     → 401 unauthorized
 *   videodelivery.net/<token>/thumbnails/thumbnail.jpg   → 200 image/jpeg (20 KB)
 *   videodelivery.net/<token-expirado>/thumbnails/…      → 401 signature expired
 *
 * Ou seja: a miniatura exige o MESMO token assinado que a reprodução, e o edge
 * revalida o `exp` (tal como faz nos segmentos de vídeo). Por isso reutiliza-se
 * `signPlaybackToken` — não há uma segunda forma de assinar, nem faria sentido
 * haver.
 *
 * ⚠️ E É POR ISSO QUE ESTE URL É SERVIDO POR UM PROXY NOSSO, NUNCA POSTO NUM
 * <img>. Medido no mesmo dia, com o mesmo token:
 *
 *   videodelivery.net/<token>/manifest/video.m3u8       → 200 (o vídeo pago!)
 *
 * O token que abre a miniatura abre o manifesto HLS inteiro — não existe no JWT
 * da Cloudflare um âmbito "só miniatura". Os cartões de arquivo são PÚBLICOS
 * (quem ainda não comprou vê-os), portanto pôr o token no `src` de uma imagem
 * era entregar o VOD pago a qualquer visitante que abrisse o inspetor. A rota
 * `/eventos/[eventId]/thumbnail` assina, vai buscar o JPEG aqui do lado do
 * servidor e devolve só a imagem; o token nasce e morre no servidor.
 *
 * O TTL do token é irrelevante nesta utilização (é consumido de imediato pelo
 * `fetch` do proxy e nunca sai daqui), daí não haver um TTL próprio de miniatura.
 */

// Domínio de entrega agnóstico da conta — o mesmo padrão do iframe do player
// (`iframe.cloudflarestream.com`), que também dispensa o subdomínio do cliente.
const STREAM_DELIVERY_BASE = "https://videodelivery.net";
// Pede-se a miniatura já reduzida: ~2x de um cartão da grelha (≈320px), 16:9.
// Um só tamanho serve todos os cartões — o `object-cover` no browser encolhe o
// resto. Poupa bytes numa página de arquivo com muitos cartões.
const THUMBNAIL_WIDTH = 640;
const THUMBNAIL_HEIGHT = 360;

/**
 * URL assinado da miniatura de uma gravação, para uso EXCLUSIVO do servidor (o
 * proxy da rota de thumbnail). Leva um token que abre o vídeo pago — ver a nota
 * acima sobre porque nunca pode chegar ao cliente.
 */
export async function signedThumbnailUrl(vodUid: string): Promise<string> {
  const token = await signPlaybackToken(vodUid, "vod");
  return `${STREAM_DELIVERY_BASE}/${token}/thumbnails/thumbnail.jpg?width=${THUMBNAIL_WIDTH}&height=${THUMBNAIL_HEIGHT}&fit=crop`;
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
