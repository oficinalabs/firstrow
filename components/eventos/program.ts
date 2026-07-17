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
