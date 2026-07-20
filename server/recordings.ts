import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { getLatestRecording } from "@/server/cloudflare-stream";

/*
 * ============================================================================
 *  LIGAR A GRAVAÇÃO AO EVENTO
 * ============================================================================
 *
 * A Cloudflare grava sozinha, mas quem tem de ir buscar o vídeo somos nós. Este
 * passo faltava por inteiro: `events.cf_vod_uid` era LIDO pelo arquivo e pela
 * página de ver, e não havia uma única linha de código que alguma vez o
 * escrevesse. Resultado na primeira transmissão real: gravação pronta do lado
 * da Cloudflare, arquivo vazio do nosso, e nada a explicar porquê.
 *
 * PORQUE É QUE NÃO CHEGA LIGAR AO TERMINAR
 *
 * A Cloudflare precisa de tempo para processar o que acabou de receber. No
 * instante em que se carrega em "Terminar", a gravação existe mas quase nunca
 * está pronta — pedi-la aí devolve nada, e se ficássemos por essa tentativa o
 * arquivo ficava vazio para sempre.
 *
 * Por isso a operação é idempotente e repetível: tenta-se ao terminar, e
 * tenta-se outra vez sempre que alguém abre a página de transmissão de um
 * evento terminado que ainda não tem gravação. Assim resolve-se sozinho, sem
 * infraestrutura nova e sem ninguém ter de se lembrar.
 *
 * O `where` exige `cf_vod_uid IS NULL`: duas tentativas em paralelo não podem
 * escrever por cima uma da outra, e uma gravação já ligada nunca é substituída
 * por outra mais recente — o arquivo não pode mudar de vídeo debaixo de quem
 * está a ver.
 */

export type LinkResult = "ligada" | "ja-ligada" | "sem-gravacao" | "nao-aplicavel";

export async function linkEventRecording(eventId: string): Promise<LinkResult> {
  const [event] = await db
    .select({
      id: events.id,
      status: events.status,
      liveInputId: events.cfLiveInputId,
      vodUid: events.cfVodUid,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) return "nao-aplicavel";
  if (event.vodUid) return "ja-ligada";
  // Só faz sentido perguntar por gravações de uma transmissão que já acabou.
  if (event.status !== "ended" || !event.liveInputId) return "nao-aplicavel";

  const gravacao = await getLatestRecording(event.liveInputId);
  if (!gravacao) return "sem-gravacao";

  const ligadas = await db
    .update(events)
    .set({ cfVodUid: gravacao.uid, updatedAt: new Date() })
    .where(and(eq(events.id, eventId), isNull(events.cfVodUid)))
    .returning({ id: events.id });

  if (ligadas.length === 0) return "ja-ligada";

  console.info(`[gravacoes] ${eventId} → ${gravacao.uid} (${gravacao.duracaoSegundos}s).`);
  return "ligada";
}
