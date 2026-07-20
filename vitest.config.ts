import { config as carregarEnv } from "dotenv";
import { defineConfig } from "vitest/config";

carregarEnv({ path: ".env", quiet: true });

/*
 * ============================================================================
 *  CONFIGURAÇÃO DOS TESTES
 * ============================================================================
 *
 * A BASE DE DADOS DOS TESTES NUNCA É A DA APLICAÇÃO
 *
 * A suite APAGA linhas. Se alguma vez apontasse para a base de produção,
 * apagava eventos e compras reais — por isso `DATABASE_URL` é aqui reescrito
 * a partir de `TEST_DATABASE_URL` e nunca herdado. Sem `TEST_DATABASE_URL`,
 * fica vazio de propósito: os testes que precisam de base saltam com uma
 * mensagem, em vez de escreverem onde não devem.
 *
 * A segunda linha de defesa está em `tests/apoio/base-de-dados.ts`, que
 * pergunta à própria ligação como se chama a base antes de deixar correr
 * seja o que for. Duas guardas porque uma só é uma distração de distância.
 *
 * `server-only` é substituído por um módulo vazio: é um marcador que o Next
 * resolve internamente para partir o build quando um ficheiro de servidor é
 * importado pelo cliente. Fora do Next não existe, e sem este alias qualquer
 * teste que toque em `lib/eupago.ts` ou `server/channel-members.ts` rebentava
 * no import.
 */

const BASE_DE_TESTES = process.env.TEST_DATABASE_URL ?? "";

/*
 * Sem base configurada, `DATABASE_URL` leva um valor de fachada. Não é para
 * ninguém se ligar a ele: é só para o `lib/env.ts` (Zod, `min(1)`) não rebentar
 * no import e derrubar a suite inteira. Os ficheiros que precisam de base
 * saltam-se sozinhos via `temBaseDeDados()`; os puros correm à mesma.
 *
 * Em CI isto nunca acontece — `tests/unidade/suite.test.ts` recusa uma corrida
 * de CI sem base, para não haver um verde que não correu os testes do dinheiro.
 */
const URL_DE_FACHADA = "postgres://sem-base/de-testes";

export default defineConfig({
  resolve: {
    // Resolve o `@/*` do tsconfig.json — o mesmo alias que a app usa.
    tsconfigPaths: true,
    alias: {
      "server-only": new URL("./tests/apoio/server-only-vazio.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/apoio/preparar.ts"],
    // Sem globais: `import { describe, it, expect } from "vitest"` deixa claro
    // de onde vem cada coisa e dispensa tipos ambiente no tsconfig.
    globals: false,
    /*
     * Ficheiros em SÉRIE, um de cada vez.
     *
     * Não é lentidão aceite por preguiça: os testes de concorrência medem
     * quantas linhas existem depois de N escritas em paralelo. Outro ficheiro
     * a escrever na mesma base ao mesmo tempo mudava essas contagens e o
     * resultado passava a depender do escalonador — exatamente o contrário do
     * que estes testes existem para provar.
     */
    fileParallelism: false,
    // Neon fica do outro lado do Atlântico: um teste de concorrência com 8
    // ligações e várias rondas leva segundos, não milissegundos.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: BASE_DE_TESTES || URL_DE_FACHADA,
      TEST_DATABASE_URL: BASE_DE_TESTES,
      // Segredos de mentira: nenhum teste pode tocar na Eupago a sério.
      // Os testes que exercitam a assinatura do webhook usam este valor.
      EUPAGO_API_KEY: "chave-de-teste-sem-valor",
      EUPAGO_WEBHOOK_SECRET: "segredo-de-teste-com-32-bytes!!!",
      EUPAGO_ENV: "sandbox",
      BETTER_AUTH_SECRET: "segredo-de-teste-sem-valor",
      BETTER_AUTH_URL: "http://localhost:3000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
});
