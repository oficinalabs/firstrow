import type { events } from "@/db/schema";

export type EventRow = typeof events.$inferSelect;

export type ChannelProgram = {
  liveNow: EventRow | null;
  nextLive: EventRow | null;
  upcoming: EventRow[];
  archive: EventRow[];
};

// Selecção pura do programa do canal sobre o resultado de listEvents().
// Fase 0 não tem fluxo de publicação: um evento "draft" com data futura conta
// como anunciado; o arquivo são os terminados com gravação pronta (cfVodUid).
export function splitProgram(rows: EventRow[], now: Date = new Date()): ChannelProgram {
  const byStartAsc = [...rows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const liveNow = byStartAsc.find((e) => e.status === "live") ?? null;
  const upcoming = byStartAsc.filter(
    (e) => e.status !== "live" && e.status !== "ended" && e.startsAt.getTime() > now.getTime(),
  );
  const archive = [...rows]
    .filter((e) => e.status === "ended" && e.cfVodUid)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return { liveNow, nextLive: upcoming[0] ?? null, upcoming, archive };
}

/*
 * O caminho da miniatura de um evento — a MESMA função para todos os cartões.
 *
 * Aponta à NOSSA rota, não à Cloudflare: o URL da Cloudflare leva um token
 * assinado que abre o vídeo pago inteiro (medido — ver `server/cloudflare-stream.ts`),
 * e estes cartões são públicos. A rota assina e vai buscar o JPEG do lado do
 * servidor; o browser só vê este caminho, sem token nenhum.
 *
 * Sem gravação (rascunho, ou ao vivo antes de existir VOD) → `null`: o cartão
 * mostra o placeholder em vez de uma imagem partida. Na prática só os eventos do
 * arquivo (terminados e com `cfVodUid`) chegam aos cartões, mas a função não
 * assume isso — devolve `null` e o cartão trata do resto.
 */
export function eventThumbnailPath(event: Pick<EventRow, "id" | "cfVodUid">): string | null {
  // Fora de /api de propósito: aí o `next.config.ts` força `no-store` e a
  // miniatura (pública, igual para todos) não podia ser cacheada. Ver a rota.
  return event.cfVodUid ? `/eventos/${event.id}/thumbnail` : null;
}
