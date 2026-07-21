import { spawn } from "node:child_process";
import fs from "node:fs";

/*
 * Corre um script de seed contra a BASE DE TESTES desta frente.
 *
 *   node scripts/semear-base-de-testes-frente-y.mjs scripts/dev-seed-responsividade.ts
 *
 * Existe por duas razões, e a segunda é a que importa:
 *
 *  1. Os seeds lêem `DATABASE_URL`, que no `.env` do worktree aponta à base de
 *     DESENVOLVIMENTO. O servidor de medição abre a de TESTES. Sem esta ponte,
 *     semeava-se num sítio e olhava-se para outro.
 *
 *  2. A string de ligação NUNCA passa pela linha de comandos nem pelo stdout.
 *     A tentativa óbvia — `DATABASE_URL=$(node -e '...') pnpm dlx tsx ...` —
 *     além de imprimir a senha, apanha o banner do dotenv para dentro da
 *     variável e rebenta com `ERR_INVALID_URL`. Passar por `env` do processo
 *     filho resolve as duas coisas de uma vez.
 */

const alvo = process.argv[2];
if (!alvo) {
  console.error("Falta o script a correr. Ex.: scripts/dev-seed-responsividade.ts");
  process.exit(1);
}

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
console.info(`Seed "${alvo}" contra a base: ${nome}`);

const filho = spawn("pnpm", ["dlx", "tsx", alvo], {
  stdio: "inherit",
  env: { ...process.env, ...env, DATABASE_URL: testes },
});
filho.on("exit", (codigo) => process.exit(codigo ?? 1));
