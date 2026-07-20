import "dotenv/config";
import postgres from "postgres";

/*
 * ============================================================================
 *  CONVERSA E GOSTOS — chat_messages, chat_timeouts, event_likes
 * ============================================================================
 *
 *   pnpm dlx tsx scripts/migrate-chat-e-gostos.ts --check      ← ver sem mexer
 *   pnpm dlx tsx scripts/migrate-chat-e-gostos.ts              ← aplicar
 *   pnpm dlx tsx scripts/migrate-chat-e-gostos.ts --rollback --confirm
 *
 * PORQUÊ: o chat ao vivo e os comentários do VOD são a MESMA conversa em duas
 * fases, por isso são uma tabela só (`chat_messages`) — ver o comentário no
 * `db/schema.ts`. `chat_timeouts` é o silenciamento por evento; `event_likes` é
 * o gosto, um por conta.
 *
 * ADITIVA E IDEMPOTENTE: `create table if not exists`, sem tocar em nada que já
 * exista. Nenhuma tabela desta migração é lida por código antigo.
 *
 * ⚠️ GUARDA DE PRODUÇÃO: o script recusa-se a correr contra uma base cujo nome
 * não pareça de desenvolvimento/teste, a menos que se passe `--producao`. Não
 * é paranoia: o `.env` da raiz do repositório aponta para produção, e um
 * worktree que herde essa variável aplicava isto à base real sem avisar.
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
    "--rollback larga as tabelas E o que estiver lá dentro. Confirma com: --rollback --confirm",
  );
  process.exit(1);
}

const alvo = (() => {
  try {
    const u = new URL(url);
    return { host: u.host, base: u.pathname.replace(/^\//, "") };
  } catch {
    return { host: "(ilegível)", base: "" };
  }
})();

console.info(
  `Base de dados: ${alvo.host}/${alvo.base}  (via ${process.env.DEV_DATABASE_URL ? "DEV_DATABASE_URL" : "DATABASE_URL"})\n`,
);

// A base tem de se parecer com desenvolvimento ou teste. `neondb` é o nome por
// omissão da Neon — é o de produção nesta plataforma.
if (!/test|teste|dev/i.test(alvo.base) && !args.has("--producao")) {
  console.error(
    `RECUSADO: "${alvo.base}" não parece uma base de desenvolvimento nem de testes.\n` +
      "Se é mesmo produção e é isso que queres, repete com --producao.",
  );
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const TABELAS = ["chat_messages", "chat_timeouts", "event_likes"] as const;

async function estado() {
  for (const t of TABELAS) {
    const [row] = await sql`
      select count(*)::int as n from information_schema.tables
       where table_schema = 'public' and table_name = ${t}`;
    console.info(`  ${t}: ${row.n > 0 ? "existe" : "não existe"}`);
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
      // Ordem inversa da criação; `cascade` para levar os índices atrás.
      for (const t of [...TABELAS].reverse()) {
        await sql.unsafe(`drop table if exists ${t} cascade`);
      }
      console.info("\n✓ tabelas largadas.");
    } else {
      await sql.begin(async (tx) => {
        await tx.unsafe(`
          create table if not exists chat_messages (
            id text primary key,
            event_id text not null references events(id) on delete cascade,
            user_id text not null references "user"(id) on delete cascade,
            body text not null,
            during_live boolean not null default false,
            created_at timestamp not null default now(),
            deleted_at timestamp,
            deleted_by text references "user"(id) on delete set null
          )`);
        // O índice do polling: o cursor é o PAR (created_at, id).
        await tx.unsafe(`
          create index if not exists chat_messages_event_idx
            on chat_messages (event_id, created_at, id)`);
        // As apagadas por moderação desde o último poll.
        await tx.unsafe(`
          create index if not exists chat_messages_deleted_idx
            on chat_messages (event_id, deleted_at)`);

        await tx.unsafe(`
          create table if not exists chat_timeouts (
            id text primary key,
            event_id text not null references events(id) on delete cascade,
            user_id text not null references "user"(id) on delete cascade,
            until timestamp not null,
            created_by text references "user"(id) on delete set null,
            created_at timestamp not null default now()
          )`);
        await tx.unsafe(`
          create unique index if not exists chat_timeouts_event_user_uq
            on chat_timeouts (event_id, user_id)`);

        await tx.unsafe(`
          create table if not exists event_likes (
            id text primary key,
            event_id text not null references events(id) on delete cascade,
            user_id text not null references "user"(id) on delete cascade,
            created_at timestamp not null default now()
          )`);
        // É este índice que faz "um gosto por conta" ser verdade mesmo com dois
        // cliques em simultâneo.
        await tx.unsafe(`
          create unique index if not exists event_likes_event_user_uq
            on event_likes (event_id, user_id)`);
        await tx.unsafe(`
          create index if not exists event_likes_event_idx on event_likes (event_id)`);
      });
      console.info("\n✓ chat_messages, chat_timeouts e event_likes criadas (com os índices).");
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
