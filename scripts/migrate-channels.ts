import "dotenv/config";
import postgres from "postgres";

/*
 * ============================================================================
 *  MIGRAÇÃO MULTI-CANAL (Frente E) — os canais passam a viver na base de dados
 * ============================================================================
 *
 *   pnpm dlx tsx scripts/migrate-channels.ts --check      ← ver sem mexer
 *   pnpm dlx tsx scripts/migrate-channels.ts              ← aplicar
 *   pnpm dlx tsx scripts/migrate-channels.ts --rollback --confirm
 *
 * Escolhe a base de dados por `DATABASE_URL`, ou por `DEV_DATABASE_URL` se ela
 * existir — assim dá para ensaiar num branch Neon sem tocar em produção. O
 * arranque diz sempre a que base é que se ligou (host e nome, nunca a
 * credencial) para não haver enganos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O QUE ACONTECE AOS DADOS QUE JÁ EXISTEM
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. Cria `channels` e semeia a SmokingBars com os valores EXATOS que estavam
 *    em código (`lib/channels.ts`). O canal em produção não muda de aspeto.
 * 2. Cria `channel_members` (utilizador + canal + papel), única por par.
 * 3. Acrescenta `events.channel_id` NULLABLE, aponta TODOS os eventos que já
 *    existem à SmokingBars, e só depois põe NOT NULL + chave estrangeira.
 *    Nenhum evento é apagado e nenhum fica órfão — se algum ficasse por
 *    preencher, o NOT NULL falhava e a transação inteira desfazia-se.
 * 4. Converte os papéis globais em filiações de canal:
 *       user.role = 'league_owner' → membro `owner` da SmokingBars
 *       user.role = 'league_staff' → membro `staff` da SmokingBars
 *    e devolve essas contas a `viewer` no papel global. Ninguém ganha nem
 *    perde acesso: muda só ONDE o acesso está guardado.
 *
 * O QUE NÃO FAZ, DE PROPÓSITO: não promove ninguém a dono. Se não houver
 * nenhum `league_owner`, a SmokingBars fica sem membros — e continua gerível,
 * porque `platform_admin` passa por cima de tudo (`server/authz.ts`). Inventar
 * um dono seria dar acesso a quem não o tinha, e isso não é trabalho de uma
 * migração.
 *
 * TUDO NUMA TRANSAÇÃO e tudo IDEMPOTENTE: corre as vezes que quiseres.
 */

const SMOKINGBARS = {
  slug: "smokingbars",
  name: "SmokingBars",
  tagline: "Batalhas de rap · Lisboa",
  accentColor: "#6CC24A",
  logoUrl: null as string | null,
  bannerUrl: null as string | null,
  initials: "SB",
};

/** Papel global antigo → papel dentro do canal. */
const ROLE_MAP = [
  { legacy: "league_owner", channelRole: "owner" },
  { legacy: "league_staff", channelRole: "staff" },
] as const;

const args = new Set(process.argv.slice(2));
const isCheck = args.has("--check");
const isRollback = args.has("--rollback");

const url = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (ou DEV_DATABASE_URL) em falta — define-a no .env antes de correr.");
  process.exit(1);
}

if (isRollback && !args.has("--confirm")) {
  console.error("--rollback apaga as tabelas de canais. Confirma com: --rollback --confirm");
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

// `max: 1` — uma migração faz uma coisa de cada vez, dentro de uma transação.
// Uma ligação só evita que as leituras do relatório abram sessões em paralelo
// (que o pooler não precisa de aguentar) e torna a ordem do que corre óbvia.
// `prepare: false` pela mesma razão que em db/index.ts: poolers pgbouncer.
const sql = postgres(url, {
  prepare: false,
  max: 1,
  // Numa segunda passagem, cada `if not exists` gera um aviso do Postgres. São
  // o sinal de que a idempotência funcionou, não um problema — mas despejados
  // em bruto escondem o que interessa. Silencia-se o esperado e deixa-se
  // passar tudo o resto.
  onnotice: (notice) => {
    const msg = String(notice.message ?? "");
    if (!/already exists|skipping/i.test(msg)) console.info(`  postgres: ${msg}`);
  },
});

type Contagem = { n: number };

async function relatorio(label: string) {
  const [[eventos], [semCanal], [canais], [membros]] = await Promise.all([
    sql<Contagem[]>`select count(*)::int as n from events`,
    sql<Contagem[]>`
      select count(*)::int as n from information_schema.columns
       where table_name = 'events' and column_name = 'channel_id'`,
    sql<Contagem[]>`
      select count(*)::int as n from information_schema.tables where table_name = 'channels'`,
    sql<Contagem[]>`
      select count(*)::int as n from information_schema.tables where table_name = 'channel_members'`,
  ]);

  const papeis = await sql<{ role: string; n: number }[]>`
    select role, count(*)::int as n from "user" group by role order by role`;

  console.info(`\n── ${label} ──`);
  console.info(
    `eventos: ${eventos.n} · tabela channels: ${canais.n ? "sim" : "não"} · ` +
      `tabela channel_members: ${membros.n ? "sim" : "não"} · ` +
      `coluna events.channel_id: ${semCanal.n ? "sim" : "não"}`,
  );
  console.info(`papéis: ${papeis.map((r) => `${r.role}=${r.n}`).join(" · ") || "(nenhum)"}`);

  if (canais.n) {
    const linhas = await sql<{ slug: string; name: string; eventos: number }[]>`
      select c.slug, c.name, count(e.id)::int as eventos
        from channels c left join events e on e.channel_id = c.id
       group by c.id, c.slug, c.name order by c.created_at`;
    for (const l of linhas) console.info(`  canal ${l.slug} (${l.name}) — ${l.eventos} evento(s)`);
  }
  if (membros.n) {
    const linhas = await sql<{ email: string; slug: string; role: string }[]>`
      select u.email, c.slug, m.role
        from channel_members m
        join "user" u on u.id = m.user_id
        join channels c on c.id = m.channel_id
       order by c.slug, m.role, u.email`;
    if (linhas.length === 0) console.info("  (sem membros de canal)");
    for (const l of linhas) console.info(`  membro ${l.email} → ${l.slug} (${l.role})`);
  }
}

async function avancar() {
  await sql.begin(async (tx) => {
    /*
     * 1. Canais.
     *
     * Os nomes das restrições são os que o drizzle-kit gera para este schema
     * (conferido com `drizzle-kit generate`). Não é cosmética: se deixássemos o
     * Postgres nomear (`channels_slug_key`, `..._fkey`), o próximo
     * `drizzle-kit generate`/`push` via uma diferença onde não há nenhuma e
     * propunha mexer no schema outra vez.
     */
    await tx`
      create table if not exists channels (
        id           text primary key,
        slug         text not null constraint channels_slug_unique unique,
        name         text not null,
        tagline      text not null,
        accent_color text not null,
        logo_url     text,
        banner_url   text,
        initials     text not null,
        created_at   timestamp not null default now(),
        updated_at   timestamp not null default now()
      )`;

    // 2. Semear a SmokingBars. `on conflict (slug)` torna isto repetível e, se
    //    o canal já existir, NÃO lhe toca no aspeto — quem o editou manda.
    await tx`
      insert into channels (id, slug, name, tagline, accent_color, logo_url, banner_url, initials)
      values (
        ${crypto.randomUUID()}, ${SMOKINGBARS.slug}, ${SMOKINGBARS.name}, ${SMOKINGBARS.tagline},
        ${SMOKINGBARS.accentColor}, ${SMOKINGBARS.logoUrl}, ${SMOKINGBARS.bannerUrl},
        ${SMOKINGBARS.initials}
      )
      on conflict (slug) do nothing`;

    const [piloto] = await tx<{ id: string }[]>`
      select id from channels where slug = ${SMOKINGBARS.slug} limit 1`;
    if (!piloto) throw new Error("canal piloto não ficou criado — abortado");

    // 3. Membros de canal.
    await tx`
      create table if not exists channel_members (
        id         text primary key,
        user_id    text not null constraint channel_members_user_id_user_id_fk
                     references "user"(id) on delete cascade,
        channel_id text not null constraint channel_members_channel_id_channels_id_fk
                     references channels(id) on delete cascade,
        role       text not null,
        created_at timestamp not null default now(),
        updated_at timestamp not null default now()
      )`;
    await tx`
      create unique index if not exists channel_members_user_channel_uq
        on channel_members (user_id, channel_id)`;
    await tx`
      create index if not exists channel_members_user_idx on channel_members (user_id)`;

    // 4. A coluna entra NULLABLE para o backfill poder correr.
    await tx`alter table events add column if not exists channel_id text`;

    const backfilled = await tx<{ id: string }[]>`
      update events set channel_id = ${piloto.id}, updated_at = now()
       where channel_id is null
      returning id`;
    console.info(`✓ ${backfilled.length} evento(s) apontado(s) à ${SMOKINGBARS.name}.`);

    // 5. Só agora se aperta. Um evento por preencher faz isto rebentar e
    //    desfaz a transação inteira — que é exatamente o que se quer.
    await tx`alter table events alter column channel_id set not null`;
    await tx`
      do $$
      begin
        if not exists (
          select 1 from pg_constraint where conname = 'events_channel_id_channels_id_fk'
        ) then
          alter table events
            add constraint events_channel_id_channels_id_fk
            foreign key (channel_id) references channels(id) on delete restrict;
        end if;
      end $$`;
    await tx`create index if not exists events_channel_idx on events (channel_id)`;

    // 6. Papéis globais → filiações de canal.
    for (const { legacy, channelRole } of ROLE_MAP) {
      const promovidos = await tx<{ id: string; email: string }[]>`
        select id, email from "user" where role = ${legacy}`;

      for (const u of promovidos) {
        await tx`
          insert into channel_members (id, user_id, channel_id, role)
          values (${crypto.randomUUID()}, ${u.id}, ${piloto.id}, ${channelRole})
          on conflict (user_id, channel_id) do nothing`;
      }

      if (promovidos.length > 0) {
        await tx`
          update "user" set role = 'viewer', updated_at = now() where role = ${legacy}`;
        console.info(
          `✓ ${promovidos.length} conta(s) ${legacy} → membro ${channelRole} da ` +
            `${SMOKINGBARS.name}, e viewer no papel global:`,
        );
        for (const u of promovidos) console.info(`    · ${u.email}`);
      } else {
        console.info(`✓ nenhuma conta com ${legacy} — nada a converter.`);
      }
    }
  });

  // 7. Invariantes. Se alguma falhar, o dado está errado e é preciso saber já.
  const [[orfaos], [papeisMaus]] = await Promise.all([
    sql<Contagem[]>`select count(*)::int as n from events where channel_id is null`,
    sql<Contagem[]>`
      select count(*)::int as n from "user" where role not in ('platform_admin', 'viewer')`,
  ]);
  if (orfaos.n > 0) throw new Error(`${orfaos.n} evento(s) sem canal — investigar.`);
  if (papeisMaus.n > 0) {
    throw new Error(`${papeisMaus.n} conta(s) com papel global fora de platform_admin/viewer.`);
  }
  console.info("\n✓ invariantes: nenhum evento órfão, nenhum papel global desconhecido.");
}

async function reverter() {
  await sql.begin(async (tx) => {
    // Devolve os papéis à coluna ANTES de deitar as filiações fora, senão
    // perdia-se quem era quem.
    for (const { legacy, channelRole } of ROLE_MAP) {
      const devolvidos = await tx<{ email: string }[]>`
        update "user" u
           set role = ${legacy}, updated_at = now()
          from channel_members m
         where m.user_id = u.id and m.role = ${channelRole} and u.role = 'viewer'
        returning u.email`;
      console.info(`✓ ${devolvidos.length} conta(s) devolvida(s) a ${legacy}.`);
    }

    await tx`alter table events drop constraint if exists events_channel_id_channels_id_fk`;
    await tx`drop index if exists events_channel_idx`;
    await tx`alter table events drop column if exists channel_id`;
    await tx`drop table if exists channel_members`;
    await tx`drop table if exists channels`;
    console.info("✓ tabelas de canais e coluna events.channel_id removidas.");
  });
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
      console.info("\nFeito. Os canais vivem agora na base de dados.");
    }
  } catch (error) {
    console.error("\nMigração falhou — nada foi gravado (transação desfeita):", error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
