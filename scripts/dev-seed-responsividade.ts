/*
 * Seed de desenvolvimento para a AUDITORIA DE RESPONSIVIDADE (Onda C1).
 *
 * Porque é que isto existe: uma tabela vazia não prova que a tabela funciona.
 * O estado vazio é o caso fácil — cabe sempre em 375px. O que rebenta a página
 * estreita é a linha com o título comprido, o email que não parte, a data por
 * extenso e sete colunas de números. Este seed cria exatamente esses casos.
 *
 * Cria: 2 canais · 8 eventos (draft/live/ended, com e sem bilhetes) · compras ·
 * bilhetes nos quatro estados · mensagens de chat (incluindo uma bem comprida e
 * uma de staff) · gostos · sessões de reprodução (vivas, substituídas e
 * revogadas, para a régie ter números).
 *
 * Uso: pnpm dlx tsx scripts/dev-seed-responsividade.ts
 * NUNCA correr contra produção — há uma guarda pelo nome da base.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  channelMembers,
  channels,
  chatMessages,
  entitlements,
  eventLikes,
  events,
  playbackSessions,
  tickets,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { issueTicket } from "@/server/tickets";

// A guarda. Pelo nome da base e não por procura de texto na string de ligação:
// o utilizador do Neon chama-se `neondb_owner` e um includes() acusava produção
// em todas as ligações — quem se habitua a ignorar o aviso ignora-o no dia em
// que ele é verdade.
const alvo = new URL(process.env.DATABASE_URL ?? "");
const nomeBase = alvo.pathname.replace(/^\//, "");
if (!/_dev_|test/i.test(nomeBase) || ["neondb", "firstrow", "postgres"].includes(nomeBase)) {
  console.error(`RECUSADO: "${nomeBase}" não é uma base de desenvolvimento descartável.`);
  process.exit(1);
}

const AGORA = new Date();
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);
const minutos = (n: number) => new Date(AGORA.getTime() + n * 60_000);

async function criarConta(email: string, nome: string, role?: "platform_admin") {
  const existente = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existente[0]) return existente[0];
  await auth.api.signUpEmail({
    body: { email, password: "Batalha-2026-Forte!", name: nome },
  });
  if (role) await db.update(user).set({ role }).where(eq(user.email, email));
  const [criado] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  return criado;
}

async function main() {
  console.info(`base: ${nomeBase}\n`);

  /* ---- contas -------------------------------------------------------- */
  // O email do admin é longo de propósito: é o que testa a barra lateral do
  // backoffice e o cabeçalho da conta a 375px.
  await criarConta(
    "administracao.plataforma@firstrow-exemplo.pt",
    "Rui Costa Administrador",
    "platform_admin",
  );
  const dono = await criarConta("dono@smokingbars.pt", "Carlos Andrade Mendes");
  const staff = await criarConta("staff@smokingbars.pt", "Marta Nogueira");
  const espectador = await criarConta("espectador@exemplo.pt", "João Silva");
  const outros = await Promise.all(
    ["ana", "pedro", "sofia", "miguel", "beatriz"].map((n, i) =>
      criarConta(`${n}@exemplo.pt`, `${n[0].toUpperCase()}${n.slice(1)} Ferreira ${i}`),
    ),
  );

  /* ---- canais -------------------------------------------------------- */
  const canaisSeed = [
    {
      id: "ch_smokingbars",
      slug: "smokingbars",
      name: "SmokingBars",
      tagline: "A liga de batalhas escritas mais antiga do país",
      accentColor: "#E5372B",
      accentColorSecondary: "#EAE04A",
      initials: "SB",
    },
    {
      id: "ch_liga_norte",
      slug: "liga-norte",
      name: "Liga do Norte — Rimas e Combates do Grande Porto",
      tagline: "Batalhas à moda do Porto, todas as quintas",
      accentColor: "#2F9E63",
      accentColorSecondary: null,
      initials: "LN",
    },
  ];
  for (const c of canaisSeed) {
    await db.insert(channels).values(c).onConflictDoNothing();
  }

  for (const [userId, channelId, role] of [
    [dono.id, "ch_smokingbars", "owner"],
    [staff.id, "ch_smokingbars", "staff"],
    [dono.id, "ch_liga_norte", "owner"],
  ] as const) {
    await db
      .insert(channelMembers)
      .values({ id: `cm_${userId}_${channelId}`, userId, channelId, role })
      .onConflictDoNothing();
  }

  /* ---- eventos ------------------------------------------------------- */
  // Títulos deliberadamente longos: é o texto comprido que faz a célula de
  // tabela empurrar o body para lá dos 375px, não o texto curto do design.
  const eventosSeed = [
    {
      id: "ev_live_agora",
      channelId: "ch_smokingbars",
      title: "SB Clash #15 — Grande Final de Verão com Convidados Internacionais",
      description:
        "A final da temporada. Oito MCs, quatro rondas, um cinturão. Transmissão a partir do Porto com comentário ao vivo e entrevistas nos bastidores entre batalhas.",
      startsAt: minutos(-25),
      priceCents: 750,
      status: "live",
      cfLiveInputId: "seed-live-input-0001",
      ticketPriceCents: 1200,
      ticketCapacity: 250,
    },
    {
      id: "ev_futuro_1",
      channelId: "ch_smokingbars",
      title: "SB Clash #16 — Abertura de Temporada",
      description: "Os quatro estreantes contra os quatro finalistas da época passada.",
      startsAt: dias(9),
      priceCents: 800,
      status: "draft",
      ticketPriceCents: 1500,
      ticketCapacity: 400,
    },
    {
      id: "ev_futuro_2",
      channelId: "ch_smokingbars",
      title: "SB Sessions — Cyphers de Bairro",
      description: null,
      startsAt: dias(23),
      priceCents: 500,
      status: "draft",
      ticketPriceCents: null,
      ticketCapacity: null,
    },
    {
      id: "ev_vod_1",
      channelId: "ch_smokingbars",
      title: "SB Clash #14 — Meias-finais",
      description: "As duas meias-finais que decidiram a final desta temporada.",
      startsAt: dias(-6),
      priceCents: 750,
      status: "ended",
      cfVodUid: "seed-vod-0001",
      ticketPriceCents: 1000,
      ticketCapacity: 250,
    },
    {
      id: "ev_vod_2",
      channelId: "ch_smokingbars",
      title: "SB Clash #13 — Quartos de final",
      description: null,
      startsAt: dias(-27),
      priceCents: 750,
      status: "ended",
      cfVodUid: "seed-vod-0002",
      ticketPriceCents: null,
      ticketCapacity: null,
    },
    {
      id: "ev_norte_live",
      channelId: "ch_liga_norte",
      title: "Norte vs Sul — Desafio Interligas",
      description: "Seis batalhas, dois territórios.",
      startsAt: dias(3),
      priceCents: 600,
      status: "draft",
      ticketPriceCents: 900,
      ticketCapacity: 150,
    },
    {
      id: "ev_norte_vod",
      channelId: "ch_liga_norte",
      title: "Liga do Norte — Jornada 7",
      description: null,
      startsAt: dias(-13),
      priceCents: 600,
      status: "ended",
      cfVodUid: "seed-vod-0003",
      ticketPriceCents: null,
      ticketCapacity: null,
    },
    {
      id: "ev_norte_futuro",
      channelId: "ch_liga_norte",
      title: "Liga do Norte — Jornada 8",
      description: null,
      startsAt: dias(31),
      priceCents: 600,
      status: "draft",
      ticketPriceCents: 900,
      ticketCapacity: 150,
    },
  ] as const;

  for (const e of eventosSeed) {
    await db.insert(events).values(e).onConflictDoNothing();
  }

  /* ---- compras (acessos PPV) ----------------------------------------- */
  // Estados variados de propósito: a página de pagamentos do backoffice só
  // mostra colunas a sério se houver pendentes e expirados, não só pagos.
  const compras = [
    { u: espectador.id, e: "ev_live_agora", status: "active" },
    { u: espectador.id, e: "ev_vod_1", status: "active" },
    { u: espectador.id, e: "ev_vod_2", status: "active" },
    ...outros.map((o, i) => ({
      u: o.id,
      e: i % 2 === 0 ? "ev_live_agora" : "ev_vod_1",
      status: i === 4 ? "refunded" : "active",
    })),
  ];
  for (const [i, c] of compras.entries()) {
    await db
      .insert(entitlements)
      .values({
        id: `ent_seed_${i}`,
        userId: c.u,
        eventId: c.e,
        status: c.status,
        providerRef: `eupago-seed-${1000 + i}`,
        chargeRequestedAt: minutos(-120 - i * 7),
        createdAt: minutos(-121 - i * 7),
      })
      .onConflictDoNothing();
  }
  // Uma compra por confirmar e uma já fora da janela — para /admin/pagamentos.
  await db
    .insert(entitlements)
    .values([
      {
        id: "ent_seed_pendente",
        userId: outros[0].id,
        eventId: "ev_futuro_1",
        status: "pending",
        providerRef: "eupago-seed-pend",
        chargeRequestedAt: minutos(-2),
        createdAt: minutos(-2),
      },
      {
        id: "ent_seed_expirado",
        userId: outros[1].id,
        eventId: "ev_futuro_1",
        status: "pending",
        providerRef: "eupago-seed-exp",
        chargeRequestedAt: minutos(-4000),
        createdAt: minutos(-4000),
      },
    ])
    .onConflictDoNothing();

  /* ---- bilhetes ------------------------------------------------------ */
  const porEmitir: string[] = [];
  const bilhetesSeed = [
    { u: espectador.id, e: "ev_live_agora", preco: 1200, emitir: true },
    { u: espectador.id, e: "ev_futuro_1", preco: 1500, emitir: true },
    { u: espectador.id, e: "ev_vod_1", preco: 1000, emitir: true, usado: dias(-6) },
    ...outros.map((o, i) => ({
      u: o.id,
      e: i % 2 === 0 ? "ev_live_agora" : "ev_futuro_1",
      preco: i % 2 === 0 ? 1200 : 1500,
      emitir: true,
      usado: i === 0 ? minutos(-40) : undefined,
    })),
  ];
  for (const [i, b] of bilhetesSeed.entries()) {
    const id = `tkt_seed_${i}`;
    const existe = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    if (existe[0]) continue;
    await db.insert(tickets).values({
      id,
      eventId: b.e,
      userId: b.u,
      status: "pending",
      priceCents: b.preco,
      providerRef: `eupago-tkt-${2000 + i}`,
    });
    if (b.emitir) porEmitir.push(id);
    if ("usado" in b && b.usado) {
      await issueTicket(id, `eupago-tkt-${2000 + i}`);
      await db.update(tickets).set({ status: "used", usedAt: b.usado }).where(eq(tickets.id, id));
      porEmitir.pop();
    }
  }
  for (const id of porEmitir) await issueTicket(id, "seed-responsividade");

  /* ---- chat ---------------------------------------------------------- */
  // A mensagem comprida e o nome comprido são o teste: é aí que a bolha do
  // chat estoura a coluna a 375px se faltar um `break-words`.
  const linhas: Array<[string, string, boolean]> = [
    [dono.id, "Bem-vindos à final. Começamos daqui a cinco minutos.", true],
    [espectador.id, "vamos lá 🔥", true],
    [outros[0].id, "Este gajo escreveu isto num guardanapo e ainda ganhou a ronda", true],
    [staff.id, "Lembrete: quem tiver bilhete físico entra pela porta lateral.", true],
    [
      outros[1].id,
      "Se alguém tiver o link da última batalha do ano passado agradecia imenso porque andei a procurar no arquivo e não consegui encontrar em lado nenhum, provavelmente já saiu",
      true,
    ],
    [outros[2].id, "brutal", true],
    [espectador.id, "a segunda ronda foi outro nível", true],
    [outros[3].id, "quem é que ganhou?", true],
    [dono.id, "Resultado no fim, calma.", true],
    [outros[4].id, "playoffs quando", true],
    [espectador.id, "Revi agora no arquivo, continua a bater igual.", false],
    [outros[0].id, "Comentário posterior à transmissão, para testar a separação.", false],
  ];
  for (const [i, [userId, body, duringLive]] of linhas.entries()) {
    await db
      .insert(chatMessages)
      .values({
        id: `msg_seed_${i}`,
        eventId: i < 10 ? "ev_live_agora" : "ev_vod_1",
        userId,
        body,
        duringLive,
        createdAt: minutos(-30 + i * 2),
      })
      .onConflictDoNothing();
  }

  /* ---- gostos e sessões ---------------------------------------------- */
  for (const [i, u] of [espectador, ...outros].entries()) {
    await db
      .insert(eventLikes)
      .values({ id: `like_seed_${i}`, eventId: "ev_live_agora", userId: u.id })
      .onConflictDoNothing();
    if (i < 3) {
      await db
        .insert(eventLikes)
        .values({ id: `like_vod_${i}`, eventId: "ev_vod_1", userId: u.id })
        .onConflictDoNothing();
    }
  }

  // Régie: vivas + uma substituída (silenciosa) + duas revogadas (bloqueios a
  // sério). Sem as três variantes o painel de "sessões bloqueadas" mostra zero
  // e não se vê se o número cabe na coluna.
  for (const [i, u] of [espectador, ...outros].entries()) {
    await db
      .insert(playbackSessions)
      .values({
        id: `ps_seed_${i}`,
        userId: u.id,
        eventId: "ev_live_agora",
        deviceId: `dev-seed-${i}`,
        startedAt: minutos(-20 + i),
        lastHeartbeatAt: minutos(-1),
        supersededAt: i === 1 ? minutos(-5) : null,
        revokedAt: i === 2 || i === 3 ? minutos(-8) : null,
        revokedReason: i === 2 ? "other_device" : i === 3 ? "watermark" : null,
      })
      .onConflictDoNothing();
  }

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(events);
  console.info(`--- seed ok --- ${n} eventos`);
  console.info(`admin:      administracao.plataforma@firstrow-exemplo.pt`);
  console.info(`dono:       dono@smokingbars.pt`);
  console.info(`espectador: espectador@exemplo.pt`);
  console.info(`password:   Batalha-2026-Forte!`);
  process.exit(0);
}

void main();
