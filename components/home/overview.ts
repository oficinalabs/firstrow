import { type EventRow, splitProgram } from "@/components/eventos/program";
import { type Channel, groupEventsByChannel } from "@/lib/channels";

/** Um evento com o canal a que pertence — a visão geral mostra sempre os dois. */
export type PlatformEvent = {
  event: EventRow;
  channel: Channel;
};

export type ChannelSummary = {
  channel: Channel;
  liveNow: EventRow | null;
  upcomingCount: number;
  archiveCount: number;
};

export type PlatformOverview = {
  /** Emissões a decorrer agora, no máximo uma por canal. */
  live: PlatformEvent[];
  /** Próximas lives de todos os canais, da mais próxima para a mais distante. */
  upcoming: PlatformEvent[];
  /** Replays prontos de todos os canais, do mais recente para o mais antigo. */
  archive: EventRow[];
  channels: ChannelSummary[];
};

/*
 * Selecção pura para a página inicial. O programa de cada canal e o da
 * plataforma saem ambos de splitProgram() — as regras de "o que é próxima
 * live" e "o que é arquivo" vivem lá e só lá.
 *
 * Os canais chegam por parâmetro (lidos da BD em `server/channels.ts`) para
 * isto continuar a ser uma função pura, testável e sem I/O. Antes vinham de uma
 * lista em código, e todos os eventos eram dados como sendo do primeiro canal.
 */
export function buildOverview(
  rows: EventRow[],
  channels: readonly Channel[],
  now: Date = new Date(),
): PlatformOverview {
  const byChannel = groupEventsByChannel(rows, channels);

  const summaries: ChannelSummary[] = channels.map((channel) => {
    const program = splitProgram(byChannel.get(channel.slug) ?? [], now);
    return {
      channel,
      liveNow: program.liveNow,
      upcomingCount: program.upcoming.length,
      archiveCount: program.archive.length,
    };
  });

  const channelOfEvent = new Map(
    summaries.flatMap(({ channel }) =>
      (byChannel.get(channel.slug) ?? []).map((event) => [event.id, channel] as const),
    ),
  );

  const platform = splitProgram(rows, now);
  return {
    live: summaries.flatMap(({ channel, liveNow }) =>
      liveNow ? [{ event: liveNow, channel }] : [],
    ),
    // Um evento sem canal conhecido sai da lista em vez de aparecer com o canal
    // errado — mostrar a live de uma liga com o nome de outra é pior do que não
    // a mostrar. (Com a FK em `events.channel_id`, isto não devia acontecer.)
    upcoming: platform.upcoming.flatMap((event) => {
      const channel = channelOfEvent.get(event.id);
      return channel ? [{ event, channel }] : [];
    }),
    archive: platform.archive,
    channels: summaries,
  };
}
