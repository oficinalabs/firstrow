import "dotenv/config";
import postgres from "postgres";

/*
 * ============================================================================
 *  JANELA DA COBRANÇA — `charge_requested_at` em entitlements e tickets
 * ============================================================================
 *
 *   pnpm dlx tsx scripts/migrate-charge-window.ts --check      ← ver sem mexer
 *   pnpm dlx tsx scripts/migrate-charge-window.ts              ← aplicar
 *   pnpm dlx tsx scripts/migrate-charge-window.ts --rollback --confirm
 *
 * PORQUÊ: a compra pendente é reutilizada a cada tentativa (de propósito — não
 * queremos linhas a acumular), mas até aqui cada tentativa criava uma COBRANÇA
 * MB WAY nova. Viu-se em sandbox: três transações de 7,50 € com o mesmo
 * identificador. Em produção isso é um cliente a aceitar duas notificações e a
 * pagar duas vezes o mesmo acesso.
 *
 * Duas colunas nullable, sem default. NULL quer dizer "nunca se pediu cobrança
 * para esta compra" — que é a verdade para tudo o que já existe, e é diferente
 * de "pediu-se há muito tempo".
 *
 * ADITIVA E IDEMPOTENTE: `add column if not exists`, sem lock de tabela.
 */

const args = new Set(process.argv.slice(2));
const isCheck = args.has("--check");
const isRollback = args.has("--rollback");

const url = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (ou DEV_DATABASE_URL) em falta.");
  process.exit(1);
}
if (isRollback && !args.has("--confirm")) {
  console.error("--rollback larga as colunas. Confirma com: --rollback --confirm");
  process.exit(1);
}

const alvo = (() => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(url ilegível)";
  }
})();
console.info(
  `Base de dados: ${alvo}  (via ${process.env.DEV_DATABASE_URL ? "DEV_DATABASE_URL" : "DATABASE_URL"})\n`,
);

const sql = postgres(url, { prepare: false, max: 1 });
const TABELAS = ["entitlements", "tickets"] as const;

async function estado() {
  for (const t of TABELAS) {
    const [row] = await sql`
      select count(*)::int as n from information_schema.columns
       where table_name = ${t} and column_name = 'charge_requested_at'`;
    console.info(`  ${t}.charge_requested_at: ${row.n > 0 ? "sim" : "não"}`);
  }
}

// Envolvido em função: o esbuild que o tsx usa não aceita `await` de topo.
async function main() {
  try {
    console.info("── ANTES ──");
    await estado();

    if (isCheck) {
      console.info("\n--check: nada foi alterado.");
    } else if (isRollback) {
      for (const t of TABELAS) {
        await sql.unsafe(`alter table ${t} drop column if exists charge_requested_at`);
      }
      console.info("\n✓ colunas largadas.");
    } else {
      await sql.begin(async (tx) => {
        for (const t of TABELAS) {
          await tx.unsafe(
            `alter table ${t} add column if not exists charge_requested_at timestamp`,
          );
        }
      });
      console.info("\n✓ charge_requested_at criada nas duas tabelas (nullable, sem default).");
    }

    if (!isCheck) {
      console.info("\n── DEPOIS ──");
      await estado();
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
