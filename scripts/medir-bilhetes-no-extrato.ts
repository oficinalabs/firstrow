import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import { channelMembers, channels, entitlements, events, tickets } from "@/db/schema";
import { newId } from "@/lib/ids";

/*
 * ============================================================================
 *  BILHETES NO EXTRATO — e a identidade com a dashboard, nos bytes
 * ============================================================================
 *
 *   node scripts/servidor-medicao-frente-y.mjs      ← noutro terminal, 3017
 *   pnpm dlx tsx scripts/medir-bilhetes-no-extrato.ts
 *
 * DUAS PERGUNTAS:
 *
 *  1. O extrato de `/admin/ganhos` passou a somar os bilhetes de porta ao PPV?
 *  2. A identidade com a dashboard MANTEVE-SE? Os dois ecrãs continuam a dizer
 *     o mesmo número sobre o mesmo dinheiro — agora que esse número inclui
 *     bilhetes dos dois lados.
 *
 * Os testes de integração já provam a identidade ao cêntimo sobre os números
 * crus. Isto prova-a no fim da linha: se um formatador, um arredondamento ou
 * uma coluna divergirem entre as duas páginas, é aqui que aparece — e é aqui
 * que um utilizador veria.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  AS CONTAS, FEITAS À MÃO
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   Um evento a 93,77 € de PPV e 45,55 € de bilhete.
 *
 *     4 acessos PPV   4 × 9377 = 37508      → 375,08 €
 *     3 bilhetes      3 × 4555 = 13665      → 136,65 €
 *     BRUTO                      51173      → 511,73 €
 *
 *     comissão PPV      4 × round(937,7) = 4 × 938 = 3752
 *     comissão bilhetes 3 × round(455,5) = 3 × 456 = 1368
 *     TAXA FIRSTROW                                = 5120  → 51,20 €
 *
 *     eupago PPV      4 × (7 + round(65,639)) = 4 × 73 =  292
 *     eupago bilhetes 3 × (7 + round(31,885)) = 3 × 39 =  117
 *     TAXA EUPAGO                                      =  409  → 4,09 €
 *
 *     LÍQUIDO  51173 − 5120 − 409 = 45644              → 456,44 €
 *
 * O RUÍDO que não pode entrar em conta nenhuma: um acesso `pending`, um
 * `refunded` e um bilhete `pending`. Se algum deles contasse, o bruto subia e
 * nenhuma das linhas abaixo batia.
 */

const BASE = "http://localhost:3017";
const PASSWORD = "Batalha-Rap-2026-segura";
const MARCA = "ZZQV";

const PPV = 9377;
const BILHETE = 4555;

const BRUTO = "511,73";
const TAXA_FIRSTROW = "51,20";
const TAXA_EUPAGO = "4,09";
const LIQUIDO = "456,44";

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

// Ver a nota homónima em `medir-agenda-do-staff.ts`.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
let db: typeof import("@/db")["db"];

async function conta(email: string, nome: string): Promise<string> {
  await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ name: nome, email, password: PASSWORD }),
  });
  const entrada = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!entrada.ok) throw new Error(`login falhou (${entrada.status})`);
  return entrada.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

function contar(corpo: string, agulha: string): number {
  return corpo.split(agulha).length - 1;
}

async function main() {
  ({ db } = await import("@/db"));
  const [linha] = await db.execute<{ nome: string }>(sql`select current_database() as nome`);
  const nome = linha?.nome ?? "";
  if (!/test/i.test(nome) || ["neondb", "firstrow", "postgres"].includes(nome.toLowerCase())) {
    throw new Error(`RECUSADO: "${nome}" não é uma base descartável.`);
  }
  console.info(`Base: ${nome}\nServidor: ${BASE}\n`);
  await db.execute(sql.raw(`truncate table ${TABELAS.map((t) => `"${t}"`).join(", ")} cascade`));

  const canal = newId();
  await db.insert(channels).values({
    id: canal,
    slug: `zzqv-${Date.now()}`,
    name: `${MARCA}-LIGA`,
    tagline: "liga de medição",
    accentColor: "#3355ff",
    initials: "ZV",
  });

  const evento = newId();
  await db.insert(events).values({
    id: evento,
    channelId: canal,
    title: `${MARCA}-BATALHA`,
    startsAt: new Date(),
    priceCents: PPV,
    ticketPriceCents: BILHETE,
    ticketCapacity: 300,
    status: "ended",
  });

  /** Cria uma conta e devolve-lhe o id — cada compra é de uma pessoa diferente. */
  async function pessoa(i: number): Promise<string> {
    const id = newId();
    await db.insert(user).values({
      id,
      name: `${MARCA}-P${i}`,
      email: `zzqv-${i}-${Date.now()}@exemplo.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  // 4 acessos activos + 1 pendente + 1 reembolsado (os dois últimos são ruído).
  const estadosPpv = ["active", "active", "active", "active", "pending", "refunded"];
  for (const [i, status] of estadosPpv.entries()) {
    await db.insert(entitlements).values({
      id: newId(),
      userId: await pessoa(i),
      eventId: evento,
      status,
      createdAt: new Date(),
    });
  }

  // 3 bilhetes pagos (2 emitidos + 1 já usado à porta) + 1 pendente (ruído).
  const estadosBilhete = ["issued", "issued", "used", "pending"];
  for (const [i, status] of estadosBilhete.entries()) {
    await db.insert(tickets).values({
      id: `tkt_${newId()}`,
      userId: await pessoa(100 + i),
      eventId: evento,
      status,
      priceCents: BILHETE,
      createdAt: new Date(),
    });
  }

  const dono = await conta(`dono-${Date.now()}@exemplo.test`, "Dono da Liga");
  const firstrow = await conta(`firstrow-${Date.now()}@exemplo.test`, "FirstRow Admin");
  const [linhaDono] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.name, "Dono da Liga"));
  const [linhaAdmin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.name, "FirstRow Admin"));
  await db
    .insert(channelMembers)
    .values({ id: newId(), channelId: canal, userId: linhaDono.id, role: "owner" });
  await db.update(user).set({ role: "platform_admin" }).where(eq(user.id, linhaAdmin.id));

  async function corpo(caminho: string, cookie: string): Promise<string> {
    const r = await fetch(`${BASE}${caminho}`, { headers: { cookie }, redirect: "manual" });
    return r.text();
  }

  let falhas = 0;
  const exigir = (etiqueta: string, n: number, esperado: "presente" | "ausente") => {
    const ok = esperado === "presente" ? n > 0 : n === 0;
    if (!ok) falhas += 1;
    console.info(`    ${ok ? "✓" : "✗"} ${etiqueta}: ${n}`);
  };

  // ── O extrato do DONO, que é quem recebe o dinheiro ───────────────────────
  const ganhos = await corpo("/admin/ganhos", dono);
  console.info("── /admin/ganhos (sessão de dono de liga) ─────────────────────\n");
  exigir(`bruto com bilhetes somados (${BRUTO})`, contar(ganhos, BRUTO), "presente");
  exigir(`taxa FirstRow (${TAXA_FIRSTROW})`, contar(ganhos, TAXA_FIRSTROW), "presente");
  exigir(`taxa Eupago (${TAXA_EUPAGO})`, contar(ganhos, TAXA_EUPAGO), "presente");
  exigir(`líquido (${LIQUIDO})`, contar(ganhos, LIQUIDO), "presente");
  exigir('coluna "Bilhetes"', contar(ganhos, "Bilhetes"), "presente");
  exigir('coluna "Acessos"', contar(ganhos, "Acessos"), "presente");
  /*
   * O CONTROLO NEGATIVO: 375,08 € é o bruto SÓ de PPV — o que o extrato dizia
   * antes desta frente. Se ainda aparecesse como bruto, os bilhetes não teriam
   * entrado; e um teste que só procurasse 511,73 não distinguia "somou" de
   * "mostra os dois valores".
   */
  exigir("bruto só de PPV (375,08) — o número ANTIGO", contar(ganhos, "375,08"), "ausente");
  // O ruído: com o pendente e o reembolsado a contar, o bruto seria 699,27 €.
  exigir("bruto com o ruído incluído (699,27)", contar(ganhos, "699,27"), "ausente");
  console.info("");

  // ── A identidade: os dois ecrãs sobre o mesmo dinheiro ────────────────────
  const plataforma = await corpo("/admin/plataforma", firstrow);
  const ganhosAdmin = await corpo("/admin/ganhos", firstrow);
  console.info("── IDENTIDADE: dashboard vs extrato ───────────────────────────\n");
  const naDashboard = contar(plataforma, BRUTO);
  const noExtrato = contar(ganhosAdmin, BRUTO);
  console.info(`    receita em /admin/plataforma (${BRUTO}): ${naDashboard}`);
  console.info(`    bruto em /admin/ganhos      (${BRUTO}): ${noExtrato}`);
  if (naDashboard === 0 || noExtrato === 0) falhas += 1;

  const comissaoDashboard = contar(plataforma, TAXA_FIRSTROW);
  const comissaoExtrato = contar(ganhosAdmin, TAXA_FIRSTROW);
  console.info(`    comissão em /admin/plataforma (${TAXA_FIRSTROW}): ${comissaoDashboard}`);
  console.info(`    taxa FirstRow em /admin/ganhos (${TAXA_FIRSTROW}): ${comissaoExtrato}`);
  if (comissaoDashboard === 0 || comissaoExtrato === 0) falhas += 1;
  console.info(
    `\n  ${falhas === 0 ? "os dois ecrãs dizem o mesmo sobre o mesmo dinheiro" : "DIVERGEM"}\n`,
  );

  console.info("── VEREDITO ───────────────────────────────────────────────────\n");
  console.info(`  Verificações falhadas: ${falhas}`);
  console.info(`\n  ${falhas === 0 ? "✓ BILHETES NO EXTRATO, IDENTIDADE MANTIDA" : "✗ FALHOU"}\n`);

  await db.$client.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (erro) => {
  console.error(erro);
  await db?.$client.end().catch(() => {});
  process.exit(1);
});
