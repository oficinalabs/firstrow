import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { channels } from "@/db/schema";
import type { Channel } from "@/lib/channels";

/*
 * Leitura dos canais. É aqui que a plataforma passou a saber quem é quem:
 * até agora a lista vivia num `const` em `lib/channels.ts` e a base de dados
 * não guardava canal nenhum.
 *
 * `lib/channels.ts` fica com a parte pura (tipo, rota, agrupamento) porque
 * corre também no browser; a query vive deste lado. Ver a nota lá.
 */

/**
 * As colunas que um canal mostra ao resto da app — o espelho do tipo `Channel`.
 *
 * Escritas uma vez e usadas por todas as queries daqui: quem acrescentar uma
 * coluna à tabela não a publica sem passar por este objeto (e pelo tipo).
 */
const PUBLIC_COLUMNS = {
  id: channels.id,
  slug: channels.slug,
  name: channels.name,
  tagline: channels.tagline,
  accentColor: channels.accentColor,
  logoUrl: channels.logoUrl,
  bannerUrl: channels.bannerUrl,
  initials: channels.initials,
} as const;

/** Todos os canais, pela ordem em que aparecem na visão geral (o mais antigo à cabeça). */
export async function listChannels(): Promise<Channel[]> {
  return db.select(PUBLIC_COLUMNS).from(channels).orderBy(asc(channels.createdAt));
}

/** Canal pelo slug do URL; null se não existir (a página faz notFound()). */
export async function getChannel(slug: string): Promise<Channel | null> {
  const rows = await db
    .select(PUBLIC_COLUMNS)
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Canal pelo id — o caminho normal quando se parte de um evento
 * (`event.channelId`), que é como a marca certa chega aos ecrãs e aos recibos.
 */
export async function getChannelById(id: string): Promise<Channel | null> {
  const rows = await db.select(PUBLIC_COLUMNS).from(channels).where(eq(channels.id, id)).limit(1);
  return rows[0] ?? null;
}
