import { afterAll, beforeAll } from "vitest";
import { exigirBaseDescartavel, temBaseDeDados } from "./base-de-dados";

/*
 * Arranque da suite (`setupFiles` em vitest.config.ts).
 *
 * Corre UMA vez por ficheiro de teste, antes de qualquer teste. Serve só para
 * uma coisa: confirmar que a base de dados é descartável antes de a suite
 * poder escrever nela. Ver o cabeçalho de `base-de-dados.ts`.
 *
 * Os testes puros (split, assinaturas, códigos de QR) não precisam de base e
 * correm à mesma quando ela não está configurada — é o que permite ter uma
 * parte da suite sempre a correr, mesmo numa máquina acabada de clonar.
 */

beforeAll(async () => {
  if (!temBaseDeDados()) return;
  await exigirBaseDescartavel();
});

afterAll(async () => {
  // A ligação do postgres.js segura o processo vivo; sem isto o Vitest fica
  // à espera dela no fim de cada ficheiro.
  if (!temBaseDeDados()) return;
  const { db } = await import("@/db");
  const cliente = (db as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  await cliente?.end?.();
});
