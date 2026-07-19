import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { type ChannelRole, channelMembers } from "@/db/schema";
import { newId } from "@/lib/ids";

/*
 * ============================================================================
 *  MEMBROS DE UM CANAL — e o invariante de que um canal nunca fica sem dono
 * ============================================================================
 *
 * SER DONO É UMA LINHA AQUI, NÃO UMA COLUNA EM `channels`
 *
 * Podia ter sido `channels.owner_id`. Não é, e a diferença conta:
 *  · entregar o canal à liga quando ela assinar passa a ser um INSERT e um
 *    DELETE, em vez de uma migração;
 *  · **dois donos ao mesmo tempo** é um caso real — estas ligas têm sócios, e
 *    uma coluna só dava para um.
 *
 * O INVARIANTE: um canal nunca fica sem `owner`. Fica garantido AQUI, na
 * aplicação, e não numa constraint — o Postgres não sabe exprimir "esta tabela
 * tem de manter pelo menos uma linha com role='owner' por canal" sem triggers,
 * e um trigger escondido era pior do que uma função com nome.
 *
 * O que NÃO se faz: ler o número de donos, decidir em JS, e depois escrever.
 * Duas remoções em simultâneo passavam as duas na contagem e o canal ficava
 * sem dono nenhum. Por isso a condição vai DENTRO do `where` de cada escrita —
 * é o Postgres que avalia "existe outro dono?" no mesmo instante em que apaga.
 */

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: ChannelRole;
  createdAt: Date;
};

/** Resultado de uma mudança de membros. `last-owner` é o invariante a segurar. */
export type MemberChange =
  | { ok: true }
  | { ok: false; reason: "last-owner" | "not-a-member" | "no-such-user" };

const LAST_OWNER_MESSAGE =
  "Este é o último dono do canal. Promove outra pessoa a dono antes de o retirares.";

/** Mensagem pronta a mostrar — para não haver duas redações do mesmo "não". */
export function memberChangeMessage(reason: Exclude<MemberChange, { ok: true }>["reason"]): string {
  switch (reason) {
    case "last-owner":
      return LAST_OWNER_MESSAGE;
    case "not-a-member":
      return "Esta pessoa já não é membro do canal — recarrega a página.";
    case "no-such-user":
      return "Não há nenhuma conta com esse email.";
  }
}

/** Quem é o quê neste canal, donos primeiro. */
export async function listChannelMembers(channelId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      userId: channelMembers.userId,
      name: user.name,
      email: user.email,
      role: channelMembers.role,
      createdAt: channelMembers.createdAt,
    })
    .from(channelMembers)
    .innerJoin(user, eq(user.id, channelMembers.userId))
    .where(eq(channelMembers.channelId, channelId))
    .orderBy(channelMembers.role, user.email);
  return rows;
}

/** Quantos donos tem este canal. */
export async function countOwners(channelId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.role, "owner")));
  return row?.n ?? 0;
}

/**
 * Acrescenta (ou muda o papel de) um membro, pelo email da conta.
 *
 * Despromover é a operação perigosa — o dono que se despromove a si próprio
 * deixa o canal sem ninguém — por isso passa pela mesma guarda de `remove`.
 */
export async function setChannelMemberByEmail(
  channelId: string,
  email: string,
  role: ChannelRole,
): Promise<MemberChange> {
  const [conta] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);
  if (!conta) return { ok: false, reason: "no-such-user" };

  if (role !== "owner") {
    const despromovido = await guardLastOwner(channelId, conta.id);
    if (!despromovido.ok) return despromovido;
  }

  await db
    .insert(channelMembers)
    .values({ id: newId(), channelId, userId: conta.id, role })
    .onConflictDoUpdate({
      target: [channelMembers.userId, channelMembers.channelId],
      set: { role, updatedAt: new Date() },
    });

  return { ok: true };
}

/**
 * Retira alguém do canal.
 *
 * A condição do `where` é a guarda: só apaga se a linha **não** for de um dono,
 * ou se existir outro dono neste canal. Sem linhas apagadas, uma segunda
 * leitura diz se foi por não ser membro ou por ser o último dono.
 */
export async function removeChannelMember(
  channelId: string,
  userId: string,
): Promise<MemberChange> {
  const apagadas = await db
    .delete(channelMembers)
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        eq(channelMembers.userId, userId),
        outroDonoExiste(channelId, userId),
      ),
    )
    .returning({ userId: channelMembers.userId });

  if (apagadas.length > 0) return { ok: true };
  return guardLastOwner(channelId, userId);
}

/**
 * "Ou não és dono, ou há outro dono além de ti." Avaliado pelo Postgres dentro
 * da própria escrita, para duas remoções em paralelo não passarem as duas.
 */
function outroDonoExiste(channelId: string, userId: string) {
  return sql`(
    ${channelMembers.role} <> 'owner'
    or exists (
      select 1 from ${channelMembers} outro
       where outro.channel_id = ${channelId}
         and outro.role = 'owner'
         and outro.user_id <> ${userId}
    )
  )`;
}

/** Diagnóstico depois de uma escrita não ter mexido em nada. */
async function guardLastOwner(channelId: string, userId: string): Promise<MemberChange> {
  const [membro] = await db
    .select({ role: channelMembers.role })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
    .limit(1);
  if (!membro) return { ok: false, reason: "not-a-member" };
  if (membro.role !== "owner") return { ok: true };

  const [outro] = await db
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        eq(channelMembers.role, "owner"),
        ne(channelMembers.userId, userId),
      ),
    )
    .limit(1);

  return outro ? { ok: true } : { ok: false, reason: "last-owner" };
}
