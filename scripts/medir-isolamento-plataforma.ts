import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { channelMembers, channels, entitlements, events, playbackSessions } from "@/db/schema";
import { newId } from "@/lib/ids";

/*
 * ============================================================================
 *  A MEDIÇÃO DO ISOLAMENTO DE `/admin/plataforma`
 * ============================================================================
 *
 *   node scripts/servidor-medicao.mjs           ← noutro terminal, porta 3011
 *   pnpm dlx tsx scripts/medir-isolamento-plataforma.ts
 *
 * A PERGUNTA: um `owner` de canal que peça `/admin/plataforma` recebe alguma
 * coisa do canal alheio no corpo em bruto da resposta?
 *
 * PORQUE É QUE ISTO SE MEDE E NÃO SE LÊ: no App Router, layout e página
 * renderizam em paralelo, por isso um gate no layout decide DEPOIS de a página
 * já ter corrido as queries e já as estar a escrever no payload em streaming.
 * O ecrã fica correto e os números vão à mesma no corpo. Só se vê a olhar para
 * os BYTES — e é isso que este script faz.
 *
 * Mede-se nos dois formatos que o Next serve a mesma rota:
 *   · HTML normal (navegação direta)
 *   · payload RSC (`RSC: 1`, que é o que uma navegação do lado do cliente pede)
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O CONTROLO POSITIVO É METADE DA MEDIÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Um zero não prova nada se o marcador nunca aparecesse em lado nenhum — podia
 * estar mal escrito, ou os dados podiam nem existir. Por isso o script pede a
 * MESMA página com uma sessão de `platform_admin` e conta os mesmos marcadores:
 * lá têm de aparecer. Zero para o dono de liga E maior que zero para a FirstRow
 * é o par que torna o zero uma prova.
 */

const BASE = "http://localhost:3011";
const PASSWORD = "Batalha-Rap-2026-segura";

/* Marcadores improváveis de aparecer por acidente no HTML de uma página. */
const MARCA = "ZZQX";
const CANAL_ALHEIO = `${MARCA}-CANAL-ALHEIO`;
const EVENTO_ALHEIO = `${MARCA}-EVENTO-ALHEIO`;
const COMPRADOR_ALHEIO = `${MARCA}-COMPRADOR-ALHEIO`;
/** 93,77 € — um valor que não colide com nenhum preço por defeito das fábricas. */
const PRECO_ALHEIO = 9377;

const CANAL_PROPRIO = `${MARCA}-CANAL-PROPRIO`;
const EVENTO_PROPRIO = `${MARCA}-EVENTO-PROPRIO`;
const PRECO_PROPRIO = 1234;

const TABELAS = [
  "channel_members",
  "entitlements",
  "tickets",
  "playback_sessions",
  "purchase_consents",
  "chat_messages",
  "chat_timeouts",
  "event_likes",
  "events",
  "channels",
  "session",
  "account",
  "verification",
  "user",
];

async function guardaDeBase() {
  const [linha] = await db.execute<{ nome: string }>(sql`select current_database() as nome`);
  const nome = linha?.nome ?? "";
  if (!/test/i.test(nome) || ["neondb", "firstrow", "postgres"].includes(nome.toLowerCase())) {
    throw new Error(`RECUSADO: "${nome}" não é uma base descartável.`);
  }
  return nome;
}

async function limpar() {
  await db.execute(sql.raw(`truncate table ${TABELAS.map((t) => `"${t}"`).join(", ")} cascade`));
}

/** Regista uma conta pelo servidor a sério e devolve o cookie de sessão. */
async function conta(email: string, nome: string): Promise<string> {
  const registo = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    // O `origin` é obrigatório: o Better Auth recusa pedidos sem ele (defesa
    // CSRF). Um browser mete-o sozinho; um `fetch` de script tem de o dizer.
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ name: nome, email, password: PASSWORD }),
  });
  if (!registo.ok) throw new Error(`registo falhou (${registo.status}): ${await registo.text()}`);

  const entrada = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    // O `origin` é obrigatório: o Better Auth recusa pedidos sem ele (defesa
    // CSRF). Um browser mete-o sozinho; um `fetch` de script tem de o dizer.
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!entrada.ok) throw new Error(`login falhou (${entrada.status}): ${await entrada.text()}`);

  const cookies = entrada.headers.getSetCookie();
  const sessao = cookies.map((c) => c.split(";")[0]).join("; ");
  if (!sessao) throw new Error("sem cookie de sessão");
  return sessao;
}

type Resposta = { status: number; corpo: string };

async function pedir(caminho: string, cookie: string, rsc: boolean): Promise<Resposta> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    headers: { cookie, ...(rsc ? { RSC: "1" } : {}) },
    redirect: "manual",
  });
  return { status: resposta.status, corpo: await resposta.text() };
}

function contar(corpo: string, agulha: string): number {
  return corpo.split(agulha).length - 1;
}

const MARCADORES_ALHEIOS: [string, string][] = [
  ["nome do canal alheio", CANAL_ALHEIO],
  ["título do evento alheio", EVENTO_ALHEIO],
  ["nome do comprador alheio", COMPRADOR_ALHEIO],
  ["valor da venda alheia (93,77)", "93,77"],
  ["valor da venda alheia (cêntimos)", String(PRECO_ALHEIO)],
];

async function main() {
  const nome = await guardaDeBase();
  console.info(`Base: ${nome}\nServidor: ${BASE}\n`);
  await limpar();

  // ── Cenário: dois canais, um dono só do primeiro ──────────────────────────
  const canalA = { id: newId(), slug: `zzqx-a-${Date.now()}` };
  const canalB = { id: newId(), slug: `zzqx-b-${Date.now()}` };
  await db.insert(channels).values([
    {
      id: canalA.id,
      slug: canalA.slug,
      name: CANAL_PROPRIO,
      tagline: "liga do dono",
      accentColor: "#3355ff",
      initials: "ZP",
    },
    {
      id: canalB.id,
      slug: canalB.slug,
      name: CANAL_ALHEIO,
      tagline: "liga alheia",
      accentColor: "#ff8800",
      initials: "ZA",
    },
  ]);

  const eventoA = newId();
  const eventoB = newId();
  await db.insert(events).values([
    {
      id: eventoA,
      channelId: canalA.id,
      title: EVENTO_PROPRIO,
      startsAt: new Date(),
      priceCents: PRECO_PROPRIO,
      status: "ended",
    },
    {
      id: eventoB,
      channelId: canalB.id,
      title: EVENTO_ALHEIO,
      startsAt: new Date(),
      priceCents: PRECO_ALHEIO,
      status: "ended",
    },
  ]);

  /*
   * Um comprador do canal PRÓPRIO, para "Últimos pagamentos" ter uma linha.
   * É essa linha que prova a outra peça desta frente: o título do evento
   * passou a ser link para o hub (`eventHubPath`), e sem uma compra não havia
   * linha nenhuma onde o procurar.
   */
  const compradorA = newId();
  await db.insert(user).values({
    id: compradorA,
    name: `${MARCA}-COMPRADOR-PROPRIO`,
    email: `comprador-proprio-${Date.now()}@exemplo.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(entitlements).values({
    id: newId(),
    userId: compradorA,
    eventId: eventoA,
    status: "active",
    createdAt: new Date(),
  });

  const dono = await conta(`dono-${Date.now()}@exemplo.test`, "Dono da Liga");
  const firstrow = await conta(`firstrow-${Date.now()}@exemplo.test`, "FirstRow Admin");

  const [linhaDono] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`${user.name} = 'Dono da Liga'`);
  const [linhaAdmin] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`${user.name} = 'FirstRow Admin'`);

  // O dono é `owner` do canal A e de mais nada. O papel global fica `viewer`.
  await db
    .insert(channelMembers)
    .values({ id: newId(), channelId: canalA.id, userId: linhaDono.id, role: "owner" });
  await db.update(user).set({ role: "platform_admin" }).where(eq(user.id, linhaAdmin.id));

  // Um comprador do canal ALHEIO, com nome e compra próprios — é o dado mais
  // sensível que a dashboard global mostra.
  const compradorB = newId();
  await db.insert(user).values({
    id: compradorB,
    name: COMPRADOR_ALHEIO,
    email: `comprador-alheio-${Date.now()}@exemplo.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(entitlements).values({
    id: newId(),
    userId: compradorB,
    eventId: eventoB,
    status: "active",
    createdAt: new Date(),
  });
  /*
   * Uma compra PENDENTE e já expirada, no evento do canal ALHEIO.
   *
   * Não é enfeite do cenário: é o que faz o NOME DO COMPRADOR aparecer no ecrã
   * (o painel de saúde lista as compras por fechar com o nome ao lado). Sem
   * ela, o marcador do comprador dava zero nos DOIS lados — e um marcador que
   * nunca aparece não prova isolamento nenhum, só prova que não foi procurado
   * onde estava. O controlo positivo tem de acender TODOS os marcadores.
   *
   * Vai num segundo comprador porque `entitlements` tem índice único em
   * (user_id, event_id): o primeiro já tem uma compra ativa neste evento.
   */
  const compradorB2 = newId();
  await db.insert(user).values({
    id: compradorB2,
    name: COMPRADOR_ALHEIO,
    email: `comprador-alheio-2-${Date.now()}@exemplo.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(entitlements).values({
    id: newId(),
    userId: compradorB2,
    eventId: eventoB,
    status: "pending",
    providerRef: `${MARCA}-REF-ALHEIA`,
    chargeRequestedAt: new Date(Date.now() - 3_600_000),
    createdAt: new Date(Date.now() - 3_600_000),
  });
  await db.insert(playbackSessions).values({
    id: newId(),
    userId: compradorB,
    eventId: eventoB,
    startedAt: new Date(Date.now() - 3_600_000),
    lastHeartbeatAt: new Date(),
    revokedAt: new Date(),
    revokedReason: "other_device",
  });

  // ── A medição ─────────────────────────────────────────────────────────────
  const casos: { rotulo: string; cookie: string; rsc: boolean }[] = [
    { rotulo: "dono de liga · HTML", cookie: dono, rsc: false },
    { rotulo: "dono de liga · payload RSC", cookie: dono, rsc: true },
    { rotulo: "platform_admin · HTML (controlo)", cookie: firstrow, rsc: false },
    { rotulo: "platform_admin · RSC (controlo)", cookie: firstrow, rsc: true },
  ];

  console.info("── /admin/plataforma ──────────────────────────────────────────\n");
  const resultados: Record<string, number> = {};

  for (const caso of casos) {
    const { status, corpo } = await pedir("/admin/plataforma", caso.cookie, caso.rsc);
    let total = 0;
    const detalhe: string[] = [];
    for (const [nomeMarcador, agulha] of MARCADORES_ALHEIOS) {
      const n = contar(corpo, agulha);
      total += n;
      detalhe.push(`${nomeMarcador}: ${n}`);
    }
    resultados[caso.rotulo] = total;
    console.info(`${caso.rotulo}`);
    console.info(`  HTTP ${status} · ${corpo.length} bytes no corpo`);
    for (const linha of detalhe) console.info(`    ${linha}`);
    console.info(`  TOTAL de marcadores do canal alheio: ${total}\n`);
  }

  // ── A dashboard normal do dono: prova que a sessão é válida ───────────────
  const propria = await pedir("/admin", dono, false);
  console.info("── /admin (dashboard do próprio dono) ─────────────────────────\n");
  console.info(`  HTTP ${propria.status} · ${propria.corpo.length} bytes`);
  console.info(`    o SEU canal (${CANAL_PROPRIO}): ${contar(propria.corpo, CANAL_PROPRIO)}`);
  console.info(`    o SEU evento (${EVENTO_PROPRIO}): ${contar(propria.corpo, EVENTO_PROPRIO)}`);
  // A ponta solta desta frente: o título do evento em "Últimos pagamentos"
  // passou a ser link para o hub. Ou o href está no corpo, ou não passou.
  const hub = `/admin/eventos/${eventoA}/transmissao`;
  console.info(`    link do pagamento para o hub (${hub}): ${contar(propria.corpo, hub)}`);
  let alheiosEmAdmin = 0;
  for (const [, agulha] of MARCADORES_ALHEIOS) alheiosEmAdmin += contar(propria.corpo, agulha);
  console.info(`    marcadores do canal ALHEIO: ${alheiosEmAdmin}\n`);

  /*
   * ── Os dois ecrãs sobre o mesmo dinheiro ──────────────────────────────────
   *
   * O teste de integração já prova a identidade ao cêntimo sobre os números
   * crus. Isto prova a mesma coisa no fim da linha: no HTML que sai mesmo. Se
   * um formatador, um arredondamento ou um filtro de período divergirem entre
   * as duas páginas, é aqui que se vê — e é aqui que um utilizador veria.
   *
   * Cenário: 12,34 € (canal próprio) + 93,77 € (canal alheio) = 106,11 € de
   * PPV. É esse o total que TEM de estar nas duas páginas.
   */
  const esperado = "106,11";
  const plataforma = await pedir("/admin/plataforma", firstrow, false);
  const ganhos = await pedir("/admin/ganhos", firstrow, false);
  const naPlataforma = contar(plataforma.corpo, esperado);
  const nosGanhos = contar(ganhos.corpo, esperado);

  console.info("── RECONCILIAÇÃO: dashboard vs extrato de ganhos ──────────────\n");
  console.info(`  Total PPV esperado (12,34 + 93,77): ${esperado} €`);
  console.info(`    ocorrências em /admin/plataforma: ${naPlataforma}`);
  console.info(`    ocorrências em /admin/ganhos:     ${nosGanhos}`);
  console.info(
    `  ${naPlataforma > 0 && nosGanhos > 0 ? "✓ os dois ecrãs dizem o mesmo" : "✗ DIVERGEM"}\n`,
  );

  // ── Veredito ──────────────────────────────────────────────────────────────
  const fugaDono = resultados["dono de liga · HTML"] + resultados["dono de liga · payload RSC"];
  const controlo =
    resultados["platform_admin · HTML (controlo)"] + resultados["platform_admin · RSC (controlo)"];

  console.info("── VEREDITO ───────────────────────────────────────────────────\n");
  console.info(`  Marcadores alheios vistos pelo DONO DE LIGA:  ${fugaDono}   (tem de ser 0)`);
  console.info(`  Marcadores alheios vistos pela FIRSTROW:      ${controlo}   (tem de ser > 0)`);
  console.info(
    `  Marcadores alheios em /admin do dono:         ${alheiosEmAdmin}   (tem de ser 0)`,
  );

  const passou =
    fugaDono === 0 && controlo > 0 && alheiosEmAdmin === 0 && naPlataforma > 0 && nosGanhos > 0;
  console.info(`\n  ${passou ? "✓ ISOLADO" : "✗ FUGA"}\n`);

  await db.$client.end();
  process.exit(passou ? 0 : 1);
}

main().catch(async (erro) => {
  console.error(erro);
  await db.$client.end().catch(() => {});
  process.exit(1);
});
