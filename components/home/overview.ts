import { type EventRow, splitProgram } from "@/components/eventos/program";
import { type Channel, defaultChannel, groupEventsByChannel, listChannels } from "@/lib/channels";

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

// Selecção pura para a página inicial. O programa de cada canal e o da
// plataforma saem ambos de splitProgram() — as regras de "o que é próxima
// live" e "o que é arquivo" vivem lá e só lá.
export function buildOverview(rows: EventRow[], now: Date = new Date()): PlatformOverview {
  const byChannel = groupEventsByChannel(rows);

  const channels: ChannelSummary[] = listChannels().map((channel) => {
    const program = splitProgram(byChannel.get(channel.slug) ?? [], now);
    return {
      channel,
      liveNow: program.liveNow,
      upcomingCount: program.upcoming.length,
      archiveCount: program.archive.length,
    };
  });

  const channelOfEvent = new Map(
    channels.flatMap(({ channel }) =>
      (byChannel.get(channel.slug) ?? []).map((event) => [event.id, channel] as const),
    ),
  );

  const platform = splitProgram(rows, now);
  return {
    live: channels.flatMap(({ channel, liveNow }) =>
      liveNow ? [{ event: liveNow, channel }] : [],
    ),
    upcoming: platform.upcoming.map((event) => ({
      event,
      channel: channelOfEvent.get(event.id) ?? defaultChannel,
    })),
    archive: platform.archive,
    channels,
  };
}
