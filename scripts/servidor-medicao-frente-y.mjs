import { spawn } from "node:child_process";
import fs from "node:fs";

/*
 * Arranca o servidor de produção contra a BASE DE TESTES DESTA FRENTE, na 3017.
 *
 *   node scripts/servidor-medicao-frente-y.mjs
 *
 * É o gémeo do `servidor-medicao.mjs` (porta 3011) e existe separado por uma
 * razão prática: correm várias frentes em paralelo, e duas a disputar a mesma
 * porta e a mesma base semeavam-se uma à outra a meio da medição — que é
 * exatamente o fantasma que a base por worktree veio matar.
 *
 * O `DATABASE_URL` é REESCRITO a partir do `TEST_DATABASE_URL`, nunca herdado.
 * Sem isto, o `next start` abria a base de DESENVOLVIMENTO — e a medição semeia
 * e trunca, por isso apontá-la à base errada não é um teste inválido, é perder
 * dados.
 */

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split("\n")
    .filter((linha) => linha.includes("="))
    .map((linha) => {
      const i = linha.indexOf("=");
      return [linha.slice(0, i).trim(), linha.slice(i + 1).trim()];
    }),
);

const testes = env.TEST_DATABASE_URL;
if (!testes) throw new Error("TEST_DATABASE_URL em falta no .env");

const nome = new URL(testes).pathname.replace(/^\//, "");
if (!/test/i.test(nome) || ["neondb", "firstrow", "postgres"].includes(nome.toLowerCase())) {
  throw new Error(`RECUSADO: "${nome}" não é uma base descartável.`);
}
console.info(`Servidor a abrir a base: ${nome} (porta 3017)`);

spawn("./node_modules/.bin/next", ["start", "-p", "3017"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...env,
    DATABASE_URL: testes,
    BETTER_AUTH_URL: "http://localhost:3017",
    NEXT_PUBLIC_APP_URL: "http://localhost:3017",
    NODE_ENV: "production",
  },
});
