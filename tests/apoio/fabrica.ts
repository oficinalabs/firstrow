import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  type ChannelRole,
  channelMembers,
  channels,
  entitlements,
  events,
  playbackSessions,
  tickets,
} from "@/db/schema";
import { newId } from "@/lib/ids";

/*
 * Fábricas — o mínimo para um teste dizer o que quer sem escrever INSERTs.
 *
 * Cada uma preenche o que a coluna exige e deixa passar por cima só o que o
 * teste precisa de controlar. É isto que permite ler um teste e perceber o que
 * ele mede, em vez de ver dez campos irrelevantes a tapar o único que importa.
 *
 * Os ids são sempre novos: nenhum teste depende do que outro deixou para trás
 * (e, de qualquer forma, a base é limpa entre testes).
 */

let sequencia = 0;
/** Sufixo único por processo — mantém emails e slugs distintos sem coordenação. */
function unico(): string {
  sequencia += 1;
  return `${Date.now().toString(36)}${sequencia}`;
}

export async function criarCanal(dados: Partial<typeof channels.$inferInsert> = {}) {
  const marca = unico();
  const [linha] = await db
    .insert(channels)
    .values({
      id: newId(),
      slug: `canal-${marca}`,
      name: `Canal ${marca}`,
      tagline: "Liga de teste",
      accentColor: "#ff0000",
      initials: "CT",
      ...dados,
    })
    .returning();
  return linha;
}

export async function criarUtilizador(dados: Partial<typeof user.$inferInsert> = {}) {
  const marca = unico();
  const [linha] = await db
    .insert(user)
    .values({
      id: newId(),
      name: `Pessoa ${marca}`,
      email: `pessoa-${marca}@exemplo.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...dados,
    })
    .returning();
  return linha;
}

export async function criarMembro(channelId: string, userId: string, role: ChannelRole) {
  const [linha] = await db
    .insert(channelMembers)
    .values({ id: newId(), channelId, userId, role })
    .returning();
  return linha;
}

export async function criarEvento(
  channelId: string,
  dados: Partial<typeof events.$inferInsert> = {},
) {
  const [linha] = await db
    .insert(events)
    .values({
      id: newId(),
      channelId,
      title: `Evento ${unico()}`,
      startsAt: new Date(Date.now() + 86_400_000),
      priceCents: 750,
      status: "draft",
      ...dados,
    })
    .returning();
  return linha;
}

export async function criarEntitlement(
  userId: string,
  eventId: string,
  dados: Partial<typeof entitlements.$inferInsert> = {},
) {
  const [linha] = await db
    .insert(entitlements)
    .values({ id: newId(), userId, eventId, status: "pending", ...dados })
    .returning();
  return linha;
}

export async function criarBilhete(
  userId: string,
  eventId: string,
  dados: Partial<typeof tickets.$inferInsert> = {},
) {
  const [linha] = await db
    .insert(tickets)
    .values({
      id: `tkt_${newId()}`,
      userId,
      eventId,
      status: "pending",
      priceCents: 1000,
      ...dados,
    })
    .returning();
  return linha;
}

/**
 * Uma sessão de visionamento com duração CONTROLADA.
 *
 * Os carimbos entram à mão de propósito: a estimativa de minutos entregues vive
 * da diferença entre eles (ver `getDeliveryByEvent`), e um teste que dependesse
 * do `defaultNow()` media o tempo que a rede demorou em vez do que quer provar.
 * Passar `revokedAt` recria a sessão cortada pela regra de 1-sessão-por-conta.
 */
export async function criarSessao(
  userId: string,
  eventId: string,
  dados: Partial<typeof playbackSessions.$inferInsert> = {},
) {
  const [linha] = await db
    .insert(playbackSessions)
    .values({ id: newId(), userId, eventId, ...dados })
    .returning();
  return linha;
}

/**
 * O cenário mínimo que quase todos os testes de dinheiro querem: um canal, um
 * comprador e um evento desse canal.
 */
export async function cenarioBase() {
  const canal = await criarCanal();
  const comprador = await criarUtilizador();
  const evento = await criarEvento(canal.id);
  return { canal, comprador, evento };
}

export type CanalComDonos = {
  canal: typeof channels.$inferSelect;
  donos: (typeof user.$inferSelect)[];
};

/**
 * `quantos` canais, cada um com `porCanal` donos — tudo em três INSERTs.
 *
 * Existe por causa do relógio: os testes de concorrência repetem a mesma
 * corrida uma dúzia de vezes, e montar o cenário linha a linha punha quatro
 * idas ao Neon por ronda. Em três dezenas de rondas, era mais tempo a preparar
 * do que a medir — e uma suite lenta é uma suite que se deixa de correr.
 */
export async function criarCanaisComDonos(quantos: number, porCanal = 2): Promise<CanalComDonos[]> {
  const canaisNovos = Array.from({ length: quantos }, () => {
    const marca = unico();
    return {
      id: newId(),
      slug: `canal-${marca}`,
      name: `Canal ${marca}`,
      tagline: "Liga de teste",
      accentColor: "#ff0000",
      initials: "CT",
    };
  });

  const utilizadoresNovos = canaisNovos.flatMap(() =>
    Array.from({ length: porCanal }, () => {
      const marca = unico();
      return {
        id: newId(),
        name: `Pessoa ${marca}`,
        email: `pessoa-${marca}@exemplo.test`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
  );

  const [canaisCriados, utilizadoresCriados] = await Promise.all([
    db.insert(channels).values(canaisNovos).returning(),
    db.insert(user).values(utilizadoresNovos).returning(),
  ]);

  // `returning` não promete ordem; indexamos por id para emparelhar sem sustos.
  const porId = new Map(utilizadoresCriados.map((u) => [u.id, u]));
  const grupos = canaisNovos.map((canalNovo, i) => ({
    canal: canaisCriados.find((c) => c.id === canalNovo.id) as typeof channels.$inferSelect,
    donos: utilizadoresNovos
      .slice(i * porCanal, (i + 1) * porCanal)
      .map((u) => porId.get(u.id) as typeof user.$inferSelect),
  }));

  await db.insert(channelMembers).values(
    grupos.flatMap(({ canal, donos }) =>
      donos.map((dono) => ({
        id: newId(),
        channelId: canal.id,
        userId: dono.id,
        role: "owner" as ChannelRole,
      })),
    ),
  );

  return grupos;
}
