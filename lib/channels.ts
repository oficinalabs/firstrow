import type { channels } from "@/db/schema";

/*
 * Canais da plataforma — a parte PURA, que corre dos dois lados.
 *
 * A lista deixou de viver aqui: os canais são linhas da tabela `channels` e
 * quem as lê é `server/channels.ts`. Este ficheiro fica com o que não toca na
 * base de dados — o tipo, a rota pública e o agrupamento — porque é importado
 * por componentes que também correm no browser. Meter uma query aqui arrastava
 * o driver do Postgres para o bundle do cliente; é a mesma divisão que já
 * separa `lib/event-rules.ts` de `server/events.ts`.
 *
 * Co-branding: o CANAL pinta a linha de topo, o botão Seguir e realces de
 * agenda com `accentColor`; a FIRSTROW pinta barra, ações/dinheiro, checkout,
 * player e QR (tokens em globals.css). A cor do canal NUNCA entra em botões
 * de pagamento nem em estados AO VIVO.
 */

/**
 * O canal tal como o resto da app o vê — e tal como viaja para o browser.
 *
 * É uma escolha EXPLÍCITA de colunas, e não a linha inteira, de propósito: no
 * dia em que a tabela ganhar um campo interno (uma nota, um contacto, um IBAN),
 * ele não vai parar ao payload de uma página pública só porque alguém
 * acrescentou uma coluna. Quem quiser publicar um campo novo tem de o pôr aqui
 * e em `server/channels.ts` — dois sítios, ambos deliberados.
 */
export type Channel = Pick<
  typeof channels.$inferSelect,
  | "id"
  | "slug"
  | "name"
  | "tagline"
  | "accentColor"
  // A segunda cor viaja com a primeira, senão o co-branding derivava metade da
  // marca: `BrandedChannel` (lib/colors.ts) lê as duas e é assim que o filete
  // de topo sabe se tem um corte seco ou uma cor só.
  | "accentColorSecondary"
  | "logoUrl"
  | "bannerUrl"
  | "initials"
>;

/** Rota pública do canal — usar sempre isto em vez de escrever "/canal/…". */
export function channelPath(channel: Channel | string): string {
  return `/canal/${typeof channel === "string" ? channel : channel.slug}`;
}

/**
 * Eventos agrupados por slug de canal (canais sem eventos vêm com lista vazia).
 *
 * Era AQUI que vivia a mentira: a função devolvia todos os eventos debaixo do
 * canal por defeito, porque a base de dados não sabia a quem pertenciam. Agora
 * sabe, e isto passou a ler `channelId` — que é o que faz a visão geral da
 * página inicial mostrar cada evento no canal certo em vez de num só.
 *
 * Um evento cujo canal não esteja na lista dada fica DE FORA. É a escolha
 * segura: mostrá-lo debaixo de outro canal seria voltar a inventar o dono, que
 * é exatamente o bug que esta migração veio fechar.
 */
export function groupEventsByChannel<T extends { channelId: string }>(
  events: readonly T[],
  channels: readonly Channel[],
): Map<string, T[]> {
  const slugById = new Map(channels.map((channel) => [channel.id, channel.slug]));
  const byChannel = new Map<string, T[]>(channels.map((channel) => [channel.slug, []]));

  for (const event of events) {
    const slug = slugById.get(event.channelId);
    if (slug) byChannel.get(slug)?.push(event);
  }

  return byChannel;
}
