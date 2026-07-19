import "dotenv/config";
import postgres from "postgres";

/*
 * ============================================================================
 *  SEGUNDA COR DO CANAL (Frente G) — `channels.accent_color_secondary`
 * ============================================================================
 *
 *   pnpm dlx tsx scripts/migrate-channel-colors.ts --check      ← ver sem mexer
 *   pnpm dlx tsx scripts/migrate-channel-colors.ts              ← aplicar
 *   pnpm dlx tsx scripts/migrate-channel-colors.ts --rollback --confirm
 *
 * Uma coluna, e é tudo o que falta: `docs/CORES-POR-CANAL.md` desenhou o
 * sistema de cor à volta de 1 OU 2 cores por liga, mas a tabela só guardava a
 * primeira — o seletor da Frente F deixava escolher uma segunda cor que não
 * tinha onde ficar. É a única diferença entre o schema e o que a documentação
 * já promete.
 *
 * `NULL` quer dizer "a liga escolheu só uma cor", e é diferente de uma cor
 * errada: sem segunda, `lib/colors.ts` faz `--tenant-2*` cair na principal.
 * Por isso a coluna é nullable e sem default — um default aqui inventava uma
 * segunda cor para canais que nunca a pediram.
 *
 * Escolhe a base por `DATABASE_URL`, ou por `DEV_DATABASE_URL` se ela existir.
 * O arranque diz sempre a que base se ligou (host e nome, nunca a credencial).
 *
 * ADITIVA E IDEMPOTENTE: `add column if not exists` corre as vezes que se
 * quiser. O rollback larga a coluna — e por isso PERDE as segundas cores
 * escolhidas, que é o que o aviso na consola diz antes de o fazer.
 */

const args = new Set(process.argv.slice(2));
const isCheck = args.has("--check");
const isRollback = args.has("--rollback");

const url = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (ou DEV_DATABASE_URL) em falta — define-a no .env antes de correr.");
  process.exit(1);
}

if (isRollback && !args.has("--confirm")) {
  console.error(
    "--rollback larga a coluna e perde as segundas cores já escolhidas. " +
      "Confirma com: --rollback --confirm",
  );
  process.exit(1);
}

// Diz a que base é que se ligou, sem nunca imprimir a credencial.
const alvo = (() => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(url ilegível)";
  }
})();
const fonte = process.env.DEV_DATABASE_URL ? "DEV_DATABASE_URL" : "DATABASE_URL";

// `max: 1` e `prepare: false` pelas mesmas razões de `migrate-channels.ts`.
const sql = postgres(url, {
  prepare: false,
  max: 1,
  onnotice: (notice) => {
    const msg = String(notice.message ?? "");
    if (!/already exists|skipping|does not exist/i.test(msg)) console.info(`  postgres: ${msg}`);
  },
});

async function relatorio(label: string) {
  const [[coluna]] = await Promise.all([
    sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.columns
       where table_name = 'channels' and column_name = 'accent_color_secondary'`,
  ]);

  console.info(`\n── ${label} ──`);
  console.info(`coluna channels.accent_color_secondary: ${coluna.n ? "sim" : "não"}`);

  if (coluna.n) {
    const linhas = await sql<{ slug: string; accent_color: string; segunda: string | null }[]>`
      select slug, accent_color, accent_color_secondary as segunda
        from channels order by created_at`;
    for (const l of linhas) {
      console.info(`  canal ${l.slug} — ${l.accent_color} + ${l.segunda ?? "(só uma cor)"}`);
    }
  }
}

async function avancar() {
  await sql`alter table channels add column if not exists accent_color_secondary text`;
  console.info("✓ channels.accent_color_secondary criada (nullable, sem default).");
}

async function reverter() {
  const [comSegunda] = await sql<{ n: number }[]>`
    select count(*)::int as n from channels where accent_color_secondary is not null`.catch(() => [
    { n: 0 },
  ]);

  if (comSegunda.n > 0) {
    console.warn(
      `⚠️  ${comSegunda.n} canal(is) têm segunda cor escolhida — larga-se a coluna e perde-se.`,
    );
  }

  await sql`alter table channels drop column if exists accent_color_secondary`;
  console.info("✓ channels.accent_color_secondary removida.");
}

// Dentro de um `main()` e não em top-level await: o projeto não é ESM
// (`package.json` sem `"type": "module"`), por isso o tsx transpila para CJS e
// um `await` no topo do ficheiro rebenta antes de correr uma linha.
async function main() {
  try {
    console.info(`Base de dados: ${alvo}  (via ${fonte})`);
    await relatorio("ANTES");

    if (isCheck) {
      console.info("\n--check: nada foi alterado.");
    } else if (isRollback) {
      await reverter();
      await relatorio("DEPOIS (rollback)");
    } else {
      await avancar();
      await relatorio("DEPOIS");
      console.info("\nFeito. Uma liga pode agora escolher duas cores.");
    }
  } catch (error) {
    console.error("\nMigração falhou:", error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
