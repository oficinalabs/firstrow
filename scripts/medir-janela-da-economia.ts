import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import { channels, entitlements, events, playbackSessions } from "@/db/schema";
import { newId } from "@/lib/ids";

/*
 * ============================================================================
 *  A JANELA DA ECONOMIA, MEDIDA NO HTML QUE SAI MESMO
 * ============================================================================
 *
 *   node scripts/servidor-medicao-frente-y.mjs      ← noutro terminal, 3017
 *   pnpm dlx tsx scripts/medir-janela-da-economia.ts
 *
 * A PERGUNTA: os cartões "Custo de vídeo" e "Margem" de `/admin/plataforma`
 * mudam quando se muda o seletor de período — e batem certo ao cêntimo?
 *
 * Antes desta frente não mudavam: `getPlatformEconomics` não tinha janela
 * temporal e somava desde o início, enquanto os dois cartões ao lado seguiam o
 * seletor. O mesmo ecrã dizia duas coisas sobre o mesmo intervalo.
 *
 * O teste de integração já prova isto sobre os números crus. Isto prova-o no
 * fim da linha: nos bytes que um utilizador recebe. Se um formatador ou um
 * arredondamento divergirem pelo caminho, é aqui que se vê.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  AS CONTAS, FEITAS À MÃO
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   RECENTE · 93,77 € · há 2 dias      (dentro de 30d, 90d e 12m)
 *     4 compras          comissão 4 × round(937,7) = 4 × 938 = 3752 → 37,52 €
 *     2 sessões × 720 min = 1440 min
 *       custo USD round(1440 × 100 / 1000) = 144 centavos = 1,44 $
 *       custo EUR round(144 × 0,92)        = 132 cêntimos = 1,32 €
 *     margem 3752 − 132 = 3620 → 36,20 €
 *
 *   ANTIGO · 45,55 € · há 200 dias     (só dentro de 12m)
 *     3 compras          comissão 3 × round(455,5) = 3 × 456 = 1368 → 13,68 €
 *     1 sessão × 720 min = 720 min
 *       custo USD round(72) = 72 centavos → EUR round(72 × 0,92) = 66 → 0,66 €
 *     margem 1368 − 66 = 1302 → 13,02 €
 *
 *   12 MESES (os dois)
 *     comissão 3752 + 1368 = 5120 → 51,20 €
 *     custo    132  +   66 =  198 →  1,98 €
 *     margem   5120 −  198 = 4922 → 49,22 €
 *
 * ⚠️  Os totais são a SOMA dos valores já arredondados de cada evento (ver
 * `totalEconomics`), e não um novo cálculo sobre os 2160 minutos juntos. Por
 * isso 132 + 66 = 198 é escrito à mão, e não derivado.
 */

const BASE = "http://localhost:3017";
const PASSWORD = "Batalha-Rap-2026-segura";
const MARCA = "ZZQW";

const PPV_RECENTE = 9377;
const PPV_ANTIGO = 4555;
/** O teto por sessão (`MAX_SESSION_MINUTES`). Uma sessão exatamente no teto
 *  não conta como truncada — `cappedSessions` conta só o que o PASSA. */
const MINUTOS_POR_SESSAO = 720;

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

// Ver a nota homónima em `medir-agenda-do-staff.ts`: a base é reescrita para a
// de TESTES antes de `@/db` ser carregado, porque este script semeia e trunca.
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

const DIA = 86_400_000;

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
    slug: `zzqw-${Date.now()}`,
    name: `${MARCA}-LIGA`,
    tagline: "liga de medição",
    accentColor: "#3355ff",
    initials: "ZW",
  });

  const recente = newId();
  const antigo = newId();
  const haDoisDias = new Date(Date.now() - 2 * DIA);
  const haDuzentosDias = new Date(Date.now() - 200 * DIA);

  await db.insert(events).values([
    {
      id: recente,
      channelId: canal,
      title: `${MARCA}-RECENTE`,
      startsAt: haDoisDias,
      priceCents: PPV_RECENTE,
      status: "ended",
    },
    {
      id: antigo,
      channelId: canal,
      title: `${MARCA}-ANTIGO`,
      startsAt: haDuzentosDias,
      priceCents: PPV_ANTIGO,
      status: "ended",
    },
  ]);

  async function semear(eventoId: string, compras: number, sessoes: number, quando: Date) {
    for (let i = 0; i < compras; i += 1) {
      const id = newId();
      await db.insert(user).values({
        id,
        name: `${MARCA}-C${i}`,
        email: `zzqw-${eventoId.slice(0, 6)}-${i}-${Date.now()}@exemplo.test`,
        emailVerified: true,
        createdAt: quando,
        updatedAt: quando,
      });
      await db.insert(entitlements).values({
        id: newId(),
        userId: id,
        eventId: eventoId,
        status: "active",
        createdAt: quando,
      });
      if (i < sessoes) {
        await db.insert(playbackSessions).values({
          id: newId(),
          userId: id,
          eventId: eventoId,
          startedAt: quando,
          lastHeartbeatAt: new Date(quando.getTime() + MINUTOS_POR_SESSAO * 60_000),
        });
      }
    }
  }

  await semear(recente, 4, 2, haDoisDias);
  await semear(antigo, 3, 1, haDuzentosDias);

  const firstrow = await conta(`firstrow-${Date.now()}@exemplo.test`, "FirstRow Admin");
  const [linhaAdmin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.name, "FirstRow Admin"));
  await db.update(user).set({ role: "platform_admin" }).where(eq(user.id, linhaAdmin.id));

  // ── A medição ─────────────────────────────────────────────────────────────
  /** O que TEM de aparecer em cada período, e o que NÃO pode. */
  const ESPERADO: Record<string, { presentes: [string, string][]; ausentes: [string, string][] }> =
    {
      "30d": {
        presentes: [
          ["comissão do período (37,52)", "37,52"],
          ["custo de vídeo (1,32)", "1,32"],
          ["margem (36,20)", "36,20"],
        ],
        /*
         * Estes dois só existem somando os DOIS eventos. Se aparecessem numa
         * vista de 30 dias, o evento antigo teria entrado na conta — que é
         * exactamente o defeito que esta frente veio corrigir.
         */
        ausentes: [
          ["custo de 12 meses (1,98)", "1,98"],
          ["margem de 12 meses (49,22)", "49,22"],
          ["margem do evento antigo (13,02)", "13,02"],
        ],
      },
      "90d": {
        presentes: [
          ["custo de vídeo (1,32)", "1,32"],
          ["margem (36,20)", "36,20"],
        ],
        ausentes: [["margem de 12 meses (49,22)", "49,22"]],
      },
      /*
       * ⚠️  AQUI NÃO SE PODE EXIGIR QUE "36,20" ESTEJA AUSENTE, e a primeira
       * versão deste script exigia — falhou, e a falha era da MEDIÇÃO.
       *
       * 36,20 € é o total de 30 dias, mas é TAMBÉM a margem do próprio evento
       * recente, que continua a ter a sua linha na tabela por evento dentro dos
       * 12 meses. O valor aparecer não é uma janela mal aplicada; é a linha certa
       * no sítio certo.
       *
       * Os discriminadores válidos são os do outro lado: 1,98 € e 49,22 € só se
       * conseguem calcular com os DOIS eventos, por isso não podem aparecer na
       * vista de 30 dias — e não aparecem. É isso que prova a janela.
       */
      "12m": {
        presentes: [
          ["comissão do período (51,20)", "51,20"],
          ["custo de vídeo (1,98)", "1,98"],
          ["margem (49,22)", "49,22"],
          // O evento antigo volta à tabela por evento com a sua margem própria.
          ["margem do evento antigo (13,02)", "13,02"],
        ],
        ausentes: [],
      },
    };

  let falhas = 0;
  console.info("── /admin/plataforma, período a período ───────────────────────\n");

  for (const [periodo, { presentes, ausentes }] of Object.entries(ESPERADO)) {
    const resposta = await fetch(`${BASE}/admin/plataforma?periodo=${periodo}`, {
      headers: { cookie: firstrow },
      redirect: "manual",
    });
    const corpo = await resposta.text();
    console.info(`?periodo=${periodo}  ·  HTTP ${resposta.status} · ${corpo.length} bytes`);

    for (const [etiqueta, agulha] of presentes) {
      const n = contar(corpo, agulha);
      if (n === 0) falhas += 1;
      console.info(`    ${n > 0 ? "✓" : "✗"} presente — ${etiqueta}: ${n}`);
    }
    for (const [etiqueta, agulha] of ausentes) {
      const n = contar(corpo, agulha);
      if (n > 0) falhas += 1;
      console.info(`    ${n === 0 ? "✓" : "✗"} ausente  — ${etiqueta}: ${n}`);
    }
    // O rótulo do período tem de estar no cartão: um número de 30 dias com a
    // etiqueta de sempre é a confusão que esta frente veio corrigir.
    const rotulo = periodo === "30d" ? "30 dias" : periodo === "90d" ? "90 dias" : "12 meses";
    const comRotulo = contar(corpo, `Custo de vídeo · est. · ${rotulo}`);
    if (comRotulo === 0) falhas += 1;
    console.info(`    ${comRotulo > 0 ? "✓" : "✗"} cartão diz "${rotulo}": ${comRotulo}\n`);
  }

  /*
   * O CONTROLO NEGATIVO DA MEDIÇÃO: `/admin/ganhos` não tem seletor e continua
   * a contar desde o início. Se a janela tivesse sido aplicada por engano
   * também lá, o extrato passava a mentir sobre a história toda.
   */
  const ganhos = await fetch(`${BASE}/admin/ganhos`, { headers: { cookie: firstrow } });
  const corpoGanhos = await ganhos.text();
  const desdeOInicio = contar(corpoGanhos, "desde o início");
  const margemTotal = contar(corpoGanhos, "49,22");
  console.info("── /admin/ganhos continua a ser desde o início ────────────────\n");
  console.info(`    diz "desde o início": ${desdeOInicio}`);
  console.info(`    margem dos dois eventos (49,22): ${margemTotal}`);
  if (desdeOInicio === 0 || margemTotal === 0) falhas += 1;

  console.info("\n── VEREDITO ───────────────────────────────────────────────────\n");
  console.info(`  Verificações falhadas: ${falhas}`);
  console.info(`\n  ${falhas === 0 ? "✓ A JANELA APLICA-SE, E BATE AO CÊNTIMO" : "✗ FALHOU"}\n`);

  await db.$client.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (erro) => {
  console.error(erro);
  await db?.$client.end().catch(() => {});
  process.exit(1);
});
