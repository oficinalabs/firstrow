import { sql } from "drizzle-orm";
import { db } from "@/db";

/*
 * ============================================================================
 *  A BASE DOS TESTES — e a guarda que impede o pior acidente possível
 * ============================================================================
 *
 * Esta suite faz TRUNCATE. Se alguma vez corresse contra a base da aplicação,
 * apagava eventos, compras e contas reais — não há undo, e a primeira pessoa a
 * dar por isso era uma liga a perguntar por onde andavam as vendas dela.
 *
 * Por isso a base tem de se IDENTIFICAR antes de a suite escrever seja o que
 * for: perguntamos `current_database()` à própria ligação e comparamos com o
 * que é permitido. Não é a variável de ambiente que decide — uma variável mal
 * posta é precisamente o cenário contra o qual isto existe.
 *
 * A regra: o nome tem de conter "test", e nunca pode ser um dos nomes que
 * sabemos serem reais. `firstrow`, `neondb` ou um nome desconhecido param a
 * suite inteira com uma mensagem que diz o que se passou.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Os testes usam o `db` da APLICAÇÃO (`@/db`), não uma ligação à parte. É
 * deliberado: o que interessa provar é o comportamento do código que vai para
 * produção, com o pool e as opções que ele usa lá. Uma ligação de teste com
 * outras definições podia esconder (ou inventar) um problema de concorrência.
 *
 * `vitest.config.ts` reescreve `DATABASE_URL` a partir de `TEST_DATABASE_URL`,
 * por isso `@/db` já abre na base descartável.
 */

const PADRAO_PERMITIDO = /test/i;

/** Nomes que nunca podem passar, aconteça o que acontecer. */
const NOMES_PROIBIDOS = ["neondb", "firstrow", "postgres"];

/** Todas as tabelas que a aplicação escreve. Com CASCADE a ordem é irrelevante. */
const TABELAS = [
  "channel_members",
  "entitlements",
  "tickets",
  "playback_sessions",
  "purchase_consents",
  "events",
  "channels",
  "session",
  "account",
  "verification",
  "user",
];

/** Há base de dados configurada? Sem ela os testes de integração saltam. */
export function temBaseDeDados(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL);
}

/**
 * Confirma que estamos numa base descartável. Corre uma vez, no arranque da
 * suite (`tests/apoio/preparar.ts`), antes de qualquer teste tocar em dados.
 */
export async function exigirBaseDescartavel(): Promise<string> {
  if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error(
      "RECUSADO: DATABASE_URL e TEST_DATABASE_URL divergem. A aplicação abriria " +
        "uma base diferente daquela que a suite limpa.",
    );
  }

  const linhas = await db.execute<{ nome: string }>(sql`select current_database() as nome`);
  const nome = linhas[0]?.nome ?? "";

  if (NOMES_PROIBIDOS.includes(nome.toLowerCase()) || !PADRAO_PERMITIDO.test(nome)) {
    throw new Error(
      `RECUSADO: a suite apaga tabelas e "${nome}" não parece uma base de testes. ` +
        `O nome tem de conter "test". Corrige TEST_DATABASE_URL.`,
    );
  }
  return nome;
}

/**
 * Deixa a base como estava: vazia.
 *
 * Um TRUNCATE só, com todas as tabelas na mesma instrução — é atómico e
 * dispensa pensar na ordem das chaves estrangeiras. Corre entre testes para
 * que nenhum veja as linhas do anterior: os testes de concorrência CONTAM
 * linhas, e uma sobra do teste anterior mudava o número medido.
 */
export async function limparBase(): Promise<void> {
  const lista = TABELAS.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${lista} restart identity cascade`));
}

export { db };
