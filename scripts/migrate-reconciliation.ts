import "dotenv/config";
import postgres from "postgres";

/*
 * ============================================================================
 *  RECONCILIAÇÃO — `reconciled_at` em entitlements e tickets
 * ============================================================================
 *
 *   pnpm dlx tsx scripts/migrate-reconciliation.ts --check      ← ver sem mexer
 *   pnpm dlx tsx scripts/migrate-reconciliation.ts              ← aplicar
 *   pnpm dlx tsx scripts/migrate-reconciliation.ts --rollback --confirm
 *
 * PORQUÊ: aconteceu em sandbox um pagamento confirmado do lado da Eupago cujo
 * webhook nunca chegou. A compra ficou `pending` para sempre e só foi ativada à
 * mão. Em produção isso é alguém que pagou e não tem acesso, e ninguém sabe.
 *
 * A reconciliação pergunta à Eupago, sozinha, se as compras pendentes já foram
 * pagas. Cada pergunta é uma chamada HTTP, e quem está à espera faz polling de
 * poucos em poucos segundos — sem travão, uma compra sozinha gerava dezenas de
 * chamadas por minuto. `reconciled_at` é esse travão, e tem de viver na base de
 * dados: um contador em memória não sobrevive ao serverless (cada instância da
 * Vercel tem o seu, e elas morrem entre pedidos).
 *
 * É também o que torna o travão ATÓMICO: a reconciliação reclama a compra com
 * um `update … where reconciled_at is null or reconciled_at < corte`, e o
 * Postgres reavalia essa condição depois de esperar pela linha. Duas chamadas
 * em paralelo à mesma compra dão exatamente uma pergunta à Eupago.
 *
 * Dois índices a acompanhar: o varrimento procura por estado + carimbo da
 * cobrança e, sem eles, lia a tabela toda a cada passagem do cron.
 *
 * ADITIVA E IDEMPOTENTE: `add column if not exists` + `create index if not
 * exists` (concorrente não dá dentro de transação, e as tabelas são pequenas).
 * Nada por preencher: NULL quer dizer "nunca se perguntou", que é a verdade
 * para tudo o que já existe.
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
  console.error("--rollback larga a coluna e os índices. Confirma com: --rollback --confirm");
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

// Uma linha por tabela: nome, e o índice do varrimento que a acompanha.
const TABELAS = [
  { tabela: "entitlements", indice: "entitlements_pending_idx" },
  { tabela: "tickets", indice: "tickets_pending_idx" },
] as const;

const COLUNA = "reconciled_at";

async function estado() {
  for (const { tabela, indice } of TABELAS) {
    const [coluna] = await sql`
      select count(*)::int as n from information_schema.columns
       where table_name = ${tabela} and column_name = ${COLUNA}`;
    const [idx] = await sql`
      select count(*)::int as n from pg_indexes
       where tablename = ${tabela} and indexname = ${indice}`;
    console.info(
      `  ${tabela}.${COLUNA}: ${coluna.n > 0 ? "sim" : "não"}   ${indice}: ${idx.n > 0 ? "sim" : "não"}`,
    );
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
      for (const { tabela, indice } of TABELAS) {
        await sql.unsafe(`drop index if exists ${indice}`);
        await sql.unsafe(`alter table ${tabela} drop column if exists ${COLUNA}`);
      }
      console.info("\n✓ coluna e índices largados.");
    } else {
      await sql.begin(async (tx) => {
        for (const { tabela, indice } of TABELAS) {
          await tx.unsafe(`alter table ${tabela} add column if not exists ${COLUNA} timestamp`);
          await tx.unsafe(
            `create index if not exists ${indice} on ${tabela} (status, charge_requested_at)`,
          );
        }
      });
      console.info(`\n✓ ${COLUNA} e índices criados nas duas tabelas (nullable, sem default).`);
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
