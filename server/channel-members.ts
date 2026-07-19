import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { type ChannelRole, channelMembers, channels } from "@/db/schema";
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
 * COMO SE GARANTE, E PORQUE NÃO CHEGA O ÓBVIO
 *
 * Ler o número de donos, decidir em JS e depois escrever não funciona: duas
 * remoções em simultâneo passam as duas na contagem.
 *
 * Pôr a condição dentro do `where` da escrita TAMBÉM não funciona, por muito
 * que pareça. Foi medido contra a base de dados, dois donos despromovidos em
 * paralelo, 20 rondas: **16 acabaram sem dono nenhum**. A razão é que em
 * READ COMMITTED dois UPDATE em LINHAS DIFERENTES não se bloqueiam, e o
 * `exists` de cada um avalia sobre um instantâneo anterior à escrita do outro.
 * Trincos de linha só serializam quem disputa a mesma linha — e este invariante
 * atravessa várias linhas, por isso nenhuma delas serve de ponto de encontro.
 *
 * O que funciona é dar-lhes um ponto de encontro: cada mutação abre transação e
 * tranca **a linha do canal** (`for update`) antes de mexer nos membros. As
 * mutações do mesmo canal passam a fazer fila; as de canais diferentes não se
 * estorvam. Mesma medição com o trinco: 0 em 20. A condição no `where` fica na
 * mesma, como segunda linha de defesa — é barata e apanha o caso de alguém, um
 * dia, escrever fora daqui.
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
 * deixa o canal sem ninguém — por isso passa pela mesma guarda de `remove`, e
 * pela mesma razão: trinco no canal, ver o cabeçalho.
 *
 * Promover a dono não precisa de guarda nenhuma (nunca tira donos), mas corre à
 * mesma dentro do trinco: assim a contagem de donos nunca muda por baixo de uma
 * despromoção que esteja a decidir se pode avançar.
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

  const escritas = await comCanalTrancado(channelId, (tx) =>
    tx
      .insert(channelMembers)
      .values({ id: newId(), channelId, userId: conta.id, role })
      .onConflictDoUpdate({
        target: [channelMembers.userId, channelMembers.channelId],
        set: { role, updatedAt: new Date() },
        // Promover a dono nunca deixa o canal sem donos: só a descida é guardada.
        setWhere: role === "owner" ? undefined : outroDonoExiste(channelId, conta.id),
      })
      .returning({ userId: channelMembers.userId }),
  );

  // Sem linhas, ou a condição recusou ou não havia nada a mudar. Só agora vale a
  // pena ler para dizer porquê — o diagnóstico explica, já não decide.
  if (escritas.length === 0) return guardLastOwner(channelId, conta.id);
  return { ok: true };
}

/**
 * Retira alguém do canal.
 *
 * Trinco no canal + condição no `where` — pelas razões do cabeçalho. Sem linhas
 * apagadas, uma segunda leitura diz se foi por não ser membro ou por ser o
 * último dono.
 */
export async function removeChannelMember(
  channelId: string,
  userId: string,
): Promise<MemberChange> {
  const apagadas = await comCanalTrancado(channelId, (tx) =>
    tx
      .delete(channelMembers)
      .where(
        and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, userId),
          outroDonoExiste(channelId, userId),
        ),
      )
      .returning({ userId: channelMembers.userId }),
  );

  if (apagadas.length > 0) return { ok: true };
  return guardLastOwner(channelId, userId);
}

/**
 * Corre a mutação com a linha do canal trancada, para que duas mudanças de
 * membros do MESMO canal façam fila em vez de se cruzarem. Canais diferentes
 * continuam a não se estorvar — o trinco é por linha, não por tabela.
 */
function comCanalTrancado<T>(
  channelId: string,
  mutacao: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.id, channelId))
      .for("update");
    return mutacao(tx);
  });
}

/**
 * "Ou não és dono, ou há outro dono além de ti." Avaliado pelo Postgres dentro
 * da própria escrita.
 *
 * Sozinho isto NÃO segura o invariante em paralelo — ver o cabeçalho. Quem o
 * segura é o trinco; isto fica como segunda linha de defesa, barata, para o dia
 * em que alguém escrever nesta tabela por fora destas funções.
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
