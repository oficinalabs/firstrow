import "dotenv/config";
import postgres from "postgres";

/*
 * Migração da Frente A (auth & identidade). Corre uma vez por ambiente:
 *
 *   pnpm tsx scripts/migrate-auth-hardening.ts
 *   (ou: node --experimental-strip-types scripts/migrate-auth-hardening.ts)
 *
 * Faz duas coisas, ambas IDEMPOTENTES (podes correr as vezes que quiseres):
 *
 *  1. ACRESCENTA a coluna `role` a `user` (text, NOT NULL, default 'viewer').
 *     Aditiva — não mexe em dados nem em nenhuma outra coluna.
 *
 *  2. DÁ POR VERIFICADO o email das contas que JÁ EXISTIAM.
 *     Porquê: a app está em produção e estas contas foram criadas quando não
 *     havia verificação nenhuma. Assim que o RESEND_API_KEY entrar, o login
 *     passa a exigir email confirmado — sem este passo, toda a gente que já
 *     tinha conta ficava trancada à porta por um email que nunca recebeu.
 *     Contas criadas DEPOIS desta migração seguem o fluxo normal (registo →
 *     email → confirmação).
 *
 * Nota: só mexe no schema `public` (o nosso). O schema `neon_auth` é do Neon
 * e não tem nada a ver com a app.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL em falta — define-a no .env antes de correr.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

try {
  const before = await sql<{ total: number; verificados: number }[]>`
    select count(*)::int as total,
           count(*) filter (where email_verified)::int as verificados
    from "user"
  `;
  console.info(`Antes: ${before[0].total} contas · ${before[0].verificados} com email confirmado.`);

  // 1. Coluna `role`.
  await sql`alter table "user" add column if not exists "role" text not null default 'viewer'`;
  console.info("✓ coluna `role` garantida (default 'viewer').");

  // 2. Contas antigas entram verificadas — ver explicação no topo.
  const promoted = await sql<{ email: string }[]>`
    update "user"
       set email_verified = true, updated_at = now()
     where email_verified = false
    returning email
  `;
  if (promoted.length === 0) {
    console.info("✓ nenhuma conta por confirmar — nada a fazer.");
  } else {
    console.info(`✓ ${promoted.length} conta(s) existente(s) marcada(s) como confirmada(s):`);
    for (const row of promoted) console.info(`    · ${row.email}`);
  }

  const after = await sql<{ role: string; n: number }[]>`
    select role, count(*)::int as n from "user" group by role order by role
  `;
  console.info("Papéis:", after.map((row) => `${row.role}=${row.n}`).join(" · "));
  console.info("\nFeito. O primeiro admin é promovido no próximo login (ver ADMIN_EMAILS).");
} catch (error) {
  console.error("Migração falhou:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
