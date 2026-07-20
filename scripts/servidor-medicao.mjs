import { spawn } from "node:child_process";
import fs from "node:fs";

/*
 * Arranca o servidor de produção contra a BASE DE TESTES DESTA FRENTE.
 *
 *   node scripts/servidor-medicao.mjs
 *
 * Porquê um wrapper em vez de `next start` direto: a medição de isolamento
 * precisa de semear canais e compras e depois contá-los no corpo das respostas.
 * Fazer isso na base de desenvolvimento partilhada punha lixo no ecrã de outra
 * frente — e deixava a medição à mercê de outra frente lhe mexer nos dados a
 * meio. Aqui o servidor abre a base que só esta frente usa.
 *
 * O `DATABASE_URL` é REESCRITO a partir do `TEST_DATABASE_URL` do .env, nunca
 * herdado — a mesma regra do `vitest.config.ts`, e pela mesma razão.
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
console.info(`Servidor a abrir a base: ${nome}`);

spawn("./node_modules/.bin/next", ["start", "-p", "3011"], {
  stdio: "inherit",
  env: { ...process.env, ...env, DATABASE_URL: testes, NODE_ENV: "production" },
});
