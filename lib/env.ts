import { z } from "zod";

/*
 * ============================================================================
 *  AMBIENTE — e a razão de os segredos NÃO viverem no mesmo objeto que o resto
 * ============================================================================
 *
 * Isto era um objeto só (`env`) com o `DATABASE_URL` e o `BETTER_AUTH_SECRET`
 * ao lado do `NEXT_PUBLIC_APP_URL`. Era a dívida nº 6 do docs/SEGURANCA-APP.md,
 * e o risco não era teórico: quem precisa do URL público importa `{ env }` —
 * é o que `app/eventos/[eventId]/ver/page.tsx` faz para montar o link de
 * partilha — e essa é exatamente a linha que alguém copia para um componente
 * `"use client"` no dia em que precisar do mesmo URL no browser.
 *
 * Nesse dia, o bundler inlineava o objeto INTEIRO no JavaScript público: o
 * segredo que assina TODOS os cookies de sessão e a string de ligação à base de
 * dados, em texto, servidos a quem abrisse o código-fonte. O build passava
 * verde e a auditoria de segredos (que corre sobre um bundle de um dia) só
 * apanhava isso na próxima vez que alguém a corresse à mão.
 *
 * Agora são dois objetos:
 *   · `env`         — só valores públicos. Seguro em qualquer lado.
 *   · `envServidor` — os segredos. Importado por DOIS ficheiros, ambos de
 *                     servidor: `db/index.ts` e `lib/auth.ts`.
 *
 * A validação continua a ser UMA e a correr no arranque: uma variável em falta
 * rebenta já, com o nome dela, e não a meio do primeiro checkout.
 *
 * ⚠️ PORQUE É QUE NÃO LEVA `import "server-only"`, ao contrário de
 * `lib/server-env.ts` e dos 12 ficheiros que o têm:
 *
 * O `server-only` só é inofensivo dentro do Next, que o resolve pela condição
 * `react-server`. Fora dela — que é onde correm as ferramentas deste
 * repositório: `scripts/migrate-*.ts`, os seeds, os scripts de medição, todos
 * lançados com `tsx` — o módulo LANÇA no import. Como `db/index.ts` importa
 * este ficheiro, pô-lo aqui partia todas as migrações. Foi medido, não
 * suposto: instalou-se o pacote e o script de medição rebentou com
 * "This module cannot be imported from a Client Component module".
 *
 * A separação acima dá a maior parte da proteção sem esse custo: já não há
 * nenhum objeto que junte um segredo a um valor que alguém queira no browser.
 * O alarme de build volta a ser possível no dia em que os scripts passarem a
 * correr por um runner que perceba `react-server`.
 */

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  /*
   * É este valor que decide se o cookie de sessão leva a flag `Secure`: o
   * Better Auth deriva o `useSecureCookies` do protocolo do `baseURL`. Um
   * `http://` aqui num ambiente publicado tirava o `Secure` ao cookie de sessão
   * em silêncio — daí ser validado como URL a sério, e não como string
   * qualquer. Ver a nota em `lib/auth.ts`.
   */
  BETTER_AUTH_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.string().min(1),
});

const validado = EnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

/**
 * Valores PÚBLICOS. Não há aqui nada que faça mal chegar ao browser — é este o
 * objeto que se importa quando se precisa do URL da app.
 */
export const env = {
  NEXT_PUBLIC_APP_URL: validado.NEXT_PUBLIC_APP_URL,
} as const;

/**
 * SEGREDOS e configuração de servidor. Nunca importar de um componente
 * `"use client"`, direta ou indiretamente.
 *
 * O `BETTER_AUTH_URL` vive aqui e não em `env` apesar de não ser segredo: quem
 * o quiser no browser quer, na verdade, o `NEXT_PUBLIC_APP_URL` (têm o mesmo
 * valor), e deixá-lo do lado de fora tira um motivo para alguém vir buscar este
 * objeto ao sítio errado.
 */
export const envServidor = {
  DATABASE_URL: validado.DATABASE_URL,
  BETTER_AUTH_SECRET: validado.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: validado.BETTER_AUTH_URL,
} as const;
