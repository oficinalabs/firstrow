/*
 * Cria a base de dados de testes DESTA frente, e mais nada.
 *
 * PORQUE É QUE NÃO SE PARTILHA A BASE DE TESTES ENTRE WORKTREES
 * A suite faz `TRUNCATE` entre testes (ver tests/apoio/base-de-dados.ts). Duas
 * frentes a correr ao mesmo tempo contra a mesma base limpam-se uma à outra a
 * meio, e o que se vê é um teste a falhar por linhas que desapareceram — que
 * parece um bug do código e não é.
 *
 * Liga-se à base de DESENVOLVIMENTO para poder emitir `CREATE DATABASE` (não se
 * pode criar uma base a partir de dentro dela própria). Nunca toca em produção:
 * há uma guarda explícita mais abaixo.
 *
 *   node scripts/criar-base-de-testes-frente-t.mjs
 */
import fs from "node:fs";
import postgres from "postgres";

const env = fs.readFileSync(".env", "utf8");
const ler = (chave) => env.match(new RegExp(`^${chave}=(.*)$`, "m"))?.[1]?.trim();

const dev = new URL(ler("DATABASE_URL"));
const testes = new URL(ler("TEST_DATABASE_URL"));
const nomeTestes = testes.pathname.replace(/^\//, "");

/*
 * A guarda. `pathname` e não uma procura de texto: o utilizador do Neon
 * chama-se `neondb_owner`, por isso um `includes("neondb")` sobre a string
 * inteira acusa produção em TODAS as ligações — e quem se habitua a ignorar o
 * aviso acaba por ignorá-lo no dia em que ele é verdade.
 */
const PROIBIDAS = ["neondb", "postgres", "firstrow"];
for (const [rotulo, url] of [
  ["DATABASE_URL", dev],
  ["TEST_DATABASE_URL", testes],
]) {
  const nome = url.pathname.replace(/^\//, "");
  if (PROIBIDAS.includes(nome.toLowerCase())) {
    throw new Error(`RECUSADO: ${rotulo} aponta para "${nome}", que é uma base a sério.`);
  }
}
if (!/test/i.test(nomeTestes)) {
  throw new Error(
    `RECUSADO: "${nomeTestes}" não parece base de testes (o nome tem de conter "test").`,
  );
}

const sql = postgres(dev.toString(), { max: 1 });
try {
  const [existe] = await sql`select 1 from pg_database where datname = ${nomeTestes}`;
  if (existe) {
    console.log(`já existia: ${nomeTestes}`);
  } else {
    // Sem parâmetros: `CREATE DATABASE` não os aceita. O nome vem do .env desta
    // frente e já passou as guardas acima.
    await sql.unsafe(`create database "${nomeTestes}"`);
    console.log(`criada: ${nomeTestes}`);
  }
} finally {
  await sql.end();
}
