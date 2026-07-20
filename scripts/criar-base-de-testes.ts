import "dotenv/config";
import postgres from "postgres";

/*
 * ============================================================================
 *  UMA BASE DE TESTES SÓ TUA
 * ============================================================================
 *
 *   1. põe o nome que queres no TEST_DATABASE_URL do teu .env
 *      (ex.: …/firstrow_testes_frente_s)
 *   2. pnpm dlx tsx scripts/criar-base-de-testes.ts
 *   3. ./node_modules/.bin/drizzle-kit push --config=drizzle.testes.config.ts
 *
 * PORQUÊ UMA BASE POR WORKTREE, e não a `firstrow_teste` partilhada: a suite
 * faz `truncate` a catorze tabelas entre CADA teste. Dois worktrees a correr
 * testes na mesma base apagam-se um ao outro a meio — o segundo vê linhas a
 * desaparecer entre o seed e a asserção, e o sintoma parece um bug do código
 * em prova, não uma colisão de ambientes.
 *
 * Não é hipotético: aconteceu duas vezes nesta sessão, uma na base de testes e
 * outra na de DEV (10 contas passaram a 5 a meio de uma medição). Custa uma
 * base vazia; poupa uma tarde a perseguir um fantasma.
 *
 * O nome TEM de conter "test": `tests/apoio/base-de-dados.ts` pergunta
 * `current_database()` e recusa correr se não casar /test/i. Essa guarda é a
 * que impede o pior acidente possível, e este script foi escrito para lhe
 * obedecer, não para a contornar.
 *
 * IDEMPOTENTE: se a base já existir, não faz nada e diz que já existia.
 * O `create database` não pode correr dentro de uma transação — daí o
 * `unsafe` solto em vez de um `begin`.
 */

const testes = process.env.TEST_DATABASE_URL;
if (!testes) {
  console.error("TEST_DATABASE_URL em falta. Cria o .env do worktree primeiro.");
  process.exit(1);
}

const alvo = new URL(testes);
const nome = alvo.pathname.replace(/^\//, "");

// Guarda simétrica à da suite: este script CRIA, mas o nome que cria é o mesmo
// que a suite depois vai truncar. Se não parecer uma base de testes, pára aqui
// — antes de existir — em vez de rebentar mais tarde no `beforeAll`.
if (!/test/i.test(nome) || ["neondb", "firstrow", "postgres"].includes(nome.toLowerCase())) {
  console.error(`RECUSADO: "${nome}" não parece uma base de testes descartável.`);
  process.exit(1);
}

/*
 * Para criar uma base é preciso estar ligado a OUTRA. Usa-se a de
 * desenvolvimento (`DATABASE_URL`, que o .env do worktree aponta a
 * `firstrow_teste`) só como ponto de entrada — não se lhe escreve nada.
 */
const entrada = process.env.DATABASE_URL;
if (!entrada) {
  console.error("DATABASE_URL em falta.");
  process.exit(1);
}

const porta = new URL(entrada);
console.info(`Ligação de entrada: ${porta.host}${porta.pathname}`);
console.info(`Base a criar:       ${alvo.host}/${nome}\n`);

const sql = postgres(entrada, { prepare: false, max: 1 });

async function main() {
  try {
    const [existe] = await sql`select 1 as n from pg_database where datname = ${nome}`;
    if (existe) {
      console.info(`= "${nome}" já existia — nada a fazer.`);
      return;
    }
    await sql.unsafe(`create database "${nome}"`);
    console.info(`✓ "${nome}" criada.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
