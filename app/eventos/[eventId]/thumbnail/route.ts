import { NextResponse } from "next/server";
import { signedThumbnailUrl } from "@/server/cloudflare-stream";
import { getEvent } from "@/server/events";

/*
 * ============================================================================
 *  PROXY DA MINIATURA DO ARQUIVO — o token fica do lado do servidor
 * ============================================================================
 *
 * Os cartões de arquivo mostram a miniatura da gravação. Só que a miniatura da
 * Cloudflare exige um token assinado, e esse token — medido, ver
 * `server/cloudflare-stream.ts` — abre o vídeo pago inteiro (o manifesto HLS
 * responde 200 com ele). Como o arquivo é PÚBLICO, pôr o token no `src` de uma
 * imagem entregava o VOD a quem não comprou.
 *
 * Por isso o browser pede a imagem AQUI, com um caminho sem segredo nenhum
 * (`/eventos/<id>/thumbnail`). Esta rota assina, vai buscar o JPEG à Cloudflare
 * e devolve só os bytes da imagem. É a mesma ideia do mint do token de
 * reprodução, mas ao contrário: lá o token vai para quem tem direito; aqui nunca
 * sai do servidor.
 *
 * ⚠️ PORQUE É QUE NÃO ESTÁ EM /api: `next.config.ts` força `Cache-Control:
 * no-store` em TODAS as rotas `/api/*`, e com razão — as respostas de API são
 * personalizadas (bilhetes, direitos, sessões) e um intermediário a guardá-las
 * em cache servia os dados de uma pessoa a outra. A miniatura é o contrário:
 * pública, igual para toda a gente, e queremos mesmo que seja cacheada. Debaixo
 * de /api o `no-store` ganhava ao cabeçalho daqui (medido) e cada cartão
 * re-assinava um token e ia à Cloudflare a cada abertura de página.
 *
 * A rota é pública de propósito: uma miniatura é uma pré-visualização, não é o
 * conteúdo pago. Um id sem gravação (ou inexistente) responde 404 — não há
 * imagem para mostrar, e o cartão fica com o placeholder.
 */

// A miniatura de uma gravação nunca muda (o `cfVodUid` de um evento é imutável
// depois de ligado — ver `server/recordings.ts`). Cacheia-se com folga no
// browser e no edge; `stale-while-revalidate` evita um pedido em falta se a
// entrada expirar enquanto alguém a vê.
const THUMBNAIL_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const event = await getEvent(eventId);
  if (!event?.cfVodUid) {
    // Sem gravação não há miniatura. O cliente só pede este caminho quando há
    // `cfVodUid`, mas quem lhe chamar à mão para um evento qualquer leva 404.
    return new NextResponse(null, { status: 404 });
  }

  const upstream = await fetch(await signedThumbnailUrl(event.cfVodUid), { cache: "no-store" });
  if (!upstream.ok) {
    // Falha do lado da Cloudflare (ainda a processar, token, rede): 502 e o
    // cartão cai no placeholder em vez de mostrar uma imagem partida.
    return new NextResponse(null, { status: 502 });
  }

  // Buffer em vez de stream: uma miniatura tem ~20 KB, não vale a pena a
  // complexidade de encaminhar um corpo em streaming por tão pouco.
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": THUMBNAIL_CACHE_CONTROL,
    },
  });
}
