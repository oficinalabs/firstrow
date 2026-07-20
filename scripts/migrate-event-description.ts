import "dotenv/config";
import postgres from "postgres";

/*
 * ============================================================================
 *  DESCRIÇÃO DO EVENTO — `description` em events
 * ============================================================================
 *
 *   pnpm dlx tsx scripts/migrate-event-description.ts --check      ← ver sem mexer
 *   pnpm dlx tsx scripts/migrate-event-description.ts              ← aplicar
 *   pnpm dlx tsx scripts/migrate-event-description.ts --rollback --confirm
 *
 * PORQUÊ: um evento tinha título e hora e mais nada. Quem chega à página pública
 * não sabe o que vai ver — quem batalha, o formato, o que está em jogo. A liga
 * escrevia isso no Instagram e a página do produto ficava muda.
 *
 * Uma coluna nullable, sem default. NULL quer dizer "esta liga não escreveu
 * descrição nenhuma", que é a verdade para todos os eventos que já existem.
 *
 * `text` e não `varchar(n)`: o limite de tamanho é regra de produto e vive em
 * `lib/event-rules.ts`, imposto na validação do servidor. Num `varchar(n)`, uma
 * descrição um carácter acima do limite passava a erro de base de dados — e um
 * erro de base de dados no meio de um UPDATE rebenta a gravação toda em vez de
 * devolver uma frase debaixo do campo.
 *
 * ADITIVA E IDEMPOTENTE: `add column if not exists`, sem lock de tabela e sem
 * reescrita (uma coluna nullable sem default não toca nas linhas existentes).
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
  console.error(
    "--rollback larga a coluna E o que estiver escrito nela. Confirma com: --rollback --confirm",
  );
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

async function estado() {
  const [coluna] = await sql`
    select count(*)::int as n from information_schema.columns
     where table_name = 'events' and column_name = 'description'`;
  console.info(`  events.description: ${coluna.n > 0 ? "sim" : "não"}`);
  if (coluna.n > 0) {
    const [preenchidas] = await sql`
      select count(*)::int as n from events where description is not null`;
    console.info(`  eventos com descrição: ${preenchidas.n}`);
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
      await sql.unsafe("alter table events drop column if exists description");
      console.info("\n✓ coluna largada.");
    } else {
      await sql.unsafe("alter table events add column if not exists description text");
      console.info("\n✓ events.description criada (text, nullable, sem default).");
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
