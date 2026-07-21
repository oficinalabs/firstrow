import { spawn } from "node:child_process";
import fs from "node:fs";

/*
 * Arranca o build de produção na porta 3016 contra a BASE DE TESTES desta
 * frente, para `scripts/medir-rate-limit-ligado.ts` poder bater-lhe à porta.
 *
 *   node scripts/servidor-medicao-frente-x.mjs
 *
 * Igual ao `servidor-medicao.mjs` (mesma razão de existir: não sujar a base de
 * desenvolvimento partilhada), com outra porta para as duas frentes poderem
 * medir ao mesmo tempo sem se pisarem.
 *
 * ⚠️ O `DATABASE_URL` é REESCRITO a partir do `TEST_DATABASE_URL`, nunca
 * herdado do ambiente — é o que impede uma medição de ir parar a produção.
 */

const PORTA = "3016";

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
console.info(`Servidor a abrir a base: ${nome} (porta ${PORTA})`);

spawn("./node_modules/.bin/next", ["start", "-p", PORTA], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...env,
    DATABASE_URL: testes,
    BETTER_AUTH_URL: `http://localhost:${PORTA}`,
    NEXT_PUBLIC_APP_URL: `http://localhost:${PORTA}`,
    NODE_ENV: "production",
  },
});
