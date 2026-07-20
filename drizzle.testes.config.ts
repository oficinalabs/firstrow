import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/*
 * Config do drizzle-kit apontada à BASE DE TESTES desta frente.
 *
 * Existe separada da `drizzle.config.ts` por uma razão só: aquela lê
 * `DATABASE_URL`, e um `push` distraído com o ambiente errado escreve schema na
 * base de desenvolvimento (ou pior). Aqui a fonte é `TEST_DATABASE_URL` e mais
 * nenhuma — não há variável a que se possa cair por engano.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL em falta.");

export default defineConfig({
  dialect: "postgresql",
  schema: ["./db/schema.ts", "./db/auth-schema.ts"],
  out: "./db/migrations",
  dbCredentials: { url },
});
