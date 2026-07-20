import "dotenv/config";
import postgres from "postgres";

/*
 * ============================================================================
 *  DISPOSITIVO E MOTIVO NAS SESSÕES DE VISIONAMENTO
 * ============================================================================
 *
 *   pnpm dlx tsx scripts/migrate-playback-device.ts --check      ← ver sem mexer
 *   pnpm dlx tsx scripts/migrate-playback-device.ts              ← aplicar
 *   pnpm dlx tsx scripts/migrate-playback-device.ts --rollback --confirm
 *
 * PORQUÊ: a régie mostrava "sessões bloqueadas" a contar recargas da própria
 * pessoa — 7 bloqueios para um browser só, no teste real de 20/07. Faltava
 * saber DE ONDE veio a sessão nova (`device_id`) e distinguir a substituição
 * silenciosa (`superseded_at`) do corte a sério (`revoked_at` + motivo).
 *
 * Três colunas nullable, sem default, mais um índice. NULL em `device_id` quer
 * dizer "sessão anterior a isto" — e é diferente de "dispositivo desconhecido
 * agora", que segue o caminho conservador em `server/playback.ts`.
 *
 * ADITIVA E IDEMPOTENTE: `add column if not exists`, `create index if not
 * exists` (concorrente, sem lock de escrita na tabela).
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
const COLUNAS = ["device_id", "superseded_at", "revoked_reason"] as const;
const INDICE = "playback_sessions_live_idx";

async function estado() {
  for (const c of COLUNAS) {
    const [row] = await sql`
      select count(*)::int as n from information_schema.columns
       where table_name = 'playback_sessions' and column_name = ${c}`;
    console.info(`  playback_sessions.${c}: ${row.n > 0 ? "sim" : "não"}`);
  }
  const [idx] = await sql`
    select count(*)::int as n from pg_indexes
     where tablename = 'playback_sessions' and indexname = ${INDICE}`;
  console.info(`  índice ${INDICE}: ${idx.n > 0 ? "sim" : "não"}`);
}

// Envolvido em função: o esbuild que o tsx usa não aceita `await` de topo.
async function main() {
  try {
    console.info("── ANTES ──");
    await estado();

    if (isCheck) {
      console.info("\n--check: nada foi alterado.");
    } else if (isRollback) {
      await sql.unsafe(`drop index if exists ${INDICE}`);
      for (const c of COLUNAS) {
        await sql.unsafe(`alter table playback_sessions drop column if exists ${c}`);
      }
      console.info("\n✓ colunas e índice largados.");
    } else {
      await sql.begin(async (tx) => {
        await tx.unsafe(`alter table playback_sessions add column if not exists device_id text`);
        await tx.unsafe(
          `alter table playback_sessions add column if not exists superseded_at timestamp`,
        );
        await tx.unsafe(
          `alter table playback_sessions add column if not exists revoked_reason text`,
        );
      });
      /*
       * O índice fica FORA da transação: `create index concurrently` não pode
       * correr dentro de uma, e é essa a forma de o criar sem trancar escritas
       * numa tabela que tem espectadores a bater de 20 em 20 segundos.
       */
      await sql.unsafe(
        `create index concurrently if not exists ${INDICE}
           on playback_sessions (user_id, revoked_at, superseded_at)`,
      );
      console.info("\n✓ 3 colunas nullable + índice das sessões vivas.");
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
