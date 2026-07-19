/*
 * Canais da plataforma. Fase 0: a lista vive em código (um só canal real,
 * SmokingBars) mas a ESTRUTURA já é multi-canal — a visão geral em "/" e as
 * páginas "/canal/[slug]" leem daqui, nunca de uma config solta.
 *
 * A BD continua sem coluna de canal: multi-tenant em BD é fase posterior e
 * NÃO se mexe em db/schema.ts agora. Enquanto isso, todos os eventos são do
 * canal por defeito — o único sítio que assume isso é groupEventsByChannel().
 *
 * Co-branding: o CANAL pinta a linha de topo, o botão Seguir e realces de
 * agenda com `accentColor`; a FIRSTROW pinta barra, ações/dinheiro, checkout,
 * player e QR (tokens em globals.css). A cor do canal NUNCA entra em botões
 * de pagamento nem em estados AO VIVO.
 */

export type Channel = {
  slug: string;
  name: string;
  tagline: string;
  /** Cor do canal (dados de configuração, não token de design). */
  accentColor: string;
  /** Caminho público do logo do canal; null → placeholder com iniciais. */
  logoUrl: string | null;
  /** Imagem de banner do canal; null → sem banner. */
  bannerUrl: string | null;
  initials: string;
};

const smokingbars: Channel = {
  slug: "smokingbars",
  name: "SmokingBars",
  tagline: "Batalhas de rap · Lisboa",
  accentColor: "#6CC24A",
  logoUrl: null,
  bannerUrl: null,
  initials: "SB",
};

/** Todos os canais, pela ordem em que aparecem na visão geral. */
const CHANNELS: readonly Channel[] = [smokingbars];

/** Canal a que pertencem os eventos enquanto a BD não guardar o canal. */
export const defaultChannel: Channel = smokingbars;

export function listChannels(): readonly Channel[] {
  return CHANNELS;
}

/** Canal pelo slug do URL; null se não existir (a página faz notFound()). */
export function getChannel(slug: string): Channel | null {
  return CHANNELS.find((channel) => channel.slug === slug) ?? null;
}

/** Rota pública do canal — usar sempre isto em vez de escrever "/canal/…". */
export function channelPath(channel: Channel | string): string {
  return `/canal/${typeof channel === "string" ? channel : channel.slug}`;
}

/**
 * Eventos agrupados por slug de canal (canais sem eventos vêm com lista vazia).
 * ÚNICO ponto que sabe que a BD ainda não guarda o canal: quando existir a
 * coluna, muda-se só esta função e o resto da plataforma continua igual.
 */
export function groupEventsByChannel<T>(events: readonly T[]): Map<string, T[]> {
  const byChannel = new Map<string, T[]>(CHANNELS.map((channel) => [channel.slug, []]));
  byChannel.set(defaultChannel.slug, [...events]);
  return byChannel;
}
