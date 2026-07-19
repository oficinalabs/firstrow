import "server-only";
import { asc, count, eq } from "drizzle-orm";
import type { ChannelDraft } from "@/components/admin/channel-rules";
import { db } from "@/db";
import { channelMembers, channels, events } from "@/db/schema";
import type { Channel } from "@/lib/channels";
import { newId } from "@/lib/ids";
import { type ChannelScope, inScope } from "@/server/authz";

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
  accentColorSecondary: channels.accentColorSecondary,
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

// ── A lista do backoffice ───────────────────────────────────────────────────

/** Um canal na lista de gestão, com o que se precisa de saber sem o abrir. */
export type ChannelSummary = Channel & {
  /** Quantos eventos vivem neste canal (todos os estados). */
  events: number;
  /** Quantos `owner` tem. Zero é legítimo — ver `server/channel-access.ts`. */
  owners: number;
  /** Quantos membros ao todo (donos + equipa). */
  members: number;
};

/**
 * Os canais que esta pessoa pode gerir, com as contagens do ecrã de lista.
 *
 * O âmbito é o que separa a FirstRow de um dono de liga: `inScope` devolve
 * `false` para uma lista de canais vazia, ou seja ZERO linhas — nunca "sem
 * filtro". Ver a nota em `server/authz.ts`; é a mesma regra de todas as queries
 * agregadas do backoffice, e a que impede o dono da liga A de ver a liga B.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  TRÊS QUERIES E UM MERGE, E NÃO UMA QUERY ESPERTA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A primeira versão trazia as contagens em subqueries correlacionadas escritas
 * no template `sql` do drizzle. Compilava, corria sem erro, devolvia `number`
 * — e dava **zero em tudo**. O drizzle rende as colunas de um fragmento cru
 * SEM qualificar a tabela, por isso
 *
 *     (select count(*) from events where channel_id = id)
 *
 * lia o `id` como `events.id` (que existe!) em vez do `channels.id` de fora: a
 * condição virava `events.channel_id = events.id` e nunca era verdade. Só se
 * soube porque foi medido — um canal com 2 eventos aparecia com 0.
 *
 * `join` + `group by` também não serve: com duas tabelas de cardinalidade
 * diferente na mesma query, cada evento multiplica cada membro e as contagens
 * saem infladas. Sobra o que `countSalesByEvent` (server/events.ts) já faz —
 * contar em separado e juntar em JS. A lista de canais é minúscula.
 */
export async function listChannelsInScope(scope: ChannelScope): Promise<ChannelSummary[]> {
  const [linhas, porEvento, porMembro] = await Promise.all([
    db
      .select(PUBLIC_COLUMNS)
      .from(channels)
      .where(inScope(channels.id, scope))
      .orderBy(asc(channels.createdAt)),
    db
      .select({ channelId: events.channelId, n: count() })
      .from(events)
      .where(inScope(events.channelId, scope))
      .groupBy(events.channelId),
    db
      .select({ channelId: channelMembers.channelId, role: channelMembers.role, n: count() })
      .from(channelMembers)
      .where(inScope(channelMembers.channelId, scope))
      .groupBy(channelMembers.channelId, channelMembers.role),
  ]);

  const eventos = new Map(porEvento.map((linha) => [linha.channelId, linha.n]));
  const membros = new Map<string, { total: number; owners: number }>();
  for (const linha of porMembro) {
    const atual = membros.get(linha.channelId) ?? { total: 0, owners: 0 };
    atual.total += linha.n;
    if (linha.role === "owner") atual.owners += linha.n;
    membros.set(linha.channelId, atual);
  }

  return linhas.map((canal) => ({
    ...canal,
    events: eventos.get(canal.id) ?? 0,
    owners: membros.get(canal.id)?.owners ?? 0,
    members: membros.get(canal.id)?.total ?? 0,
  }));
}

// ── Escrita ─────────────────────────────────────────────────────────────────

/*
 * Até aqui, criar um canal era SQL à mão (ver docs/SEGURANCA-APP.md, dívida 10).
 * O que entra nestas funções é sempre um rascunho **já validado** por
 * `validateChannelForm` — a mesma função que o formulário corre no browser,
 * corrida outra vez do lado de cá, porque o cliente nunca é fonte de verdade.
 */

/**
 * O que uma escrita de canal pode responder.
 *
 * `slug-taken` é um erro de CAMPO e não uma falha: dois canais não podem
 * partilhar o endereço público, e quem está a escrever tem de o saber no campo
 * do endereço, não num alerta genérico.
 */
export type ChannelSaved =
  | { ok: true; channel: Channel }
  | { ok: false; reason: "slug-taken" | "not-found" };

/**
 * Endereço já ocupado?
 *
 * `23505` é a violação de unicidade do Postgres. Em `channels` só há dois
 * índices únicos — a chave primária e o `slug` — e a primária é um UUID gerado
 * aqui, por isso uma colisão dela não acontece na prática. Sobra o endereço.
 *
 * Isto é a corrida a sério, e não um `select` antes do `insert`: entre ler e
 * escrever cabe outra escrita, e o índice único é o único sítio onde a resposta
 * não pode estar desatualizada.
 *
 * ⚠️  O CÓDIGO NÃO ESTÁ NO TOPO DO ERRO, e ler só aí foi o primeiro erro desta
 * frente. O drizzle embrulha o erro do driver num `DrizzleQueryError` e o
 * `code` do Postgres fica na `cause`. Medido: 12 criações em paralelo do mesmo
 * endereço davam 1 vencedora e **11 exceções não tratadas** em vez de 11
 * recusas limpas — a base de dados aguentava (1 linha), mas quem estava a criar
 * via "não deu para criar o canal" em vez de "este endereço já é de outro".
 * Por isso se percorre a cadeia de causas, com fundo, em vez de espreitar um
 * nível.
 */
function isSlugTaken(error: unknown): boolean {
  for (let atual: unknown = error, salto = 0; atual != null && salto < 5; salto++) {
    if ((atual as { code?: unknown }).code === "23505") return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}

/** Cria um canal. Só a FirstRow — o gate está em `server/channel-access.ts`. */
export async function createChannel(draft: ChannelDraft): Promise<ChannelSaved> {
  try {
    const [channel] = await db
      .insert(channels)
      .values({ id: newId(), ...draft })
      .returning(PUBLIC_COLUMNS);
    return { ok: true, channel };
  } catch (error) {
    if (isSlugTaken(error)) return { ok: false, reason: "slug-taken" };
    throw error;
  }
}

/**
 * Grava as alterações de marca de um canal que já existe.
 *
 * Note-se o que NÃO se toca: `createdAt` (a ordem da lista não muda por se
 * editar o nome) e, sobretudo, o `id` — é ele que segura os eventos, as compras
 * e as filiações. Mudar o endereço é permitido e parte os links partilhados; o
 * formulário avisa disso, e é uma decisão da liga, não nossa.
 */
export async function updateChannel(id: string, draft: ChannelDraft): Promise<ChannelSaved> {
  try {
    const [channel] = await db
      .update(channels)
      .set({ ...draft, updatedAt: new Date() })
      .where(eq(channels.id, id))
      .returning(PUBLIC_COLUMNS);
    // Sem linha, o canal desapareceu entre abrir o ecrã e carregar em guardar.
    return channel ? { ok: true, channel } : { ok: false, reason: "not-found" };
  } catch (error) {
    if (isSlugTaken(error)) return { ok: false, reason: "slug-taken" };
    throw error;
  }
}
