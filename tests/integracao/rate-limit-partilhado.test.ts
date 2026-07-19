import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimitShared, type RateLimitPolicy } from "@/lib/rate-limit";
import { db, temBaseDeDados } from "../apoio/base-de-dados";
import { cumpridos, emParalelo } from "../apoio/paralelo";

/*
 * ============================================================================
 *  O LIMITE QUE SOBREVIVE AO SERVERLESS
 * ============================================================================
 *
 * PORQUE É QUE O ANTIGO NÃO CHEGAVA
 *
 * O contador em memória vive no processo. Na Vercel há muitas instâncias, cada
 * uma com o seu `Map`, e uma instância fria começa do zero — na prática, o
 * limite não vale quase nada. O contador partilhado põe a conta numa linha de
 * Postgres que todas as instâncias incrementam, e é isso que estes testes
 * provam: o limite é GLOBAL, não por instância.
 *
 * O TESTE QUE VALE POR TODOS é o da corrida: N pedidos EM PARALELO, sobre
 * ligações diferentes (a simular instâncias diferentes a bater na mesma linha
 * ao mesmo tempo), têm de somar exatamente `max` aceites — nem mais um. Se o
 * incremento não fosse atómico, dois pedidos liam a mesma contagem e passavam
 * os dois. Ver a barreira em `tests/apoio/paralelo.ts`: liberta as tarefas no
 * mesmo instante, sem `sleep`.
 *
 * A tabela `rate_limit_hits` é criada em runtime pela própria `lib/rate-limit`
 * (não vem do schema), por isso limpa-se aqui à mão em vez de pela `limparBase`.
 */

/** Política pequena e explícita — não usa os valores reais, para o teste ser óbvio. */
const POLITICA: RateLimitPolicy = { max: 5, windowMs: 60_000 };

/** Um id novo por teste garante um balde limpo mesmo sem truncar. */
let sequencia = 0;
function idNovo(): string {
  sequencia += 1;
  return `alvo-${Date.now().toString(36)}-${sequencia}`;
}

describe.skipIf(!temBaseDeDados())("contador de rate limit partilhado", () => {
  beforeEach(async () => {
    // Garante a tabela (uma primeira chamada cria-a) e limpa-a.
    await checkRateLimitShared("auth", idNovo(), POLITICA);
    await db.execute(sql`truncate table rate_limit_hits`);
  });

  it("deixa passar até `max` e recusa o seguinte", async () => {
    const id = idNovo();
    const veredictos: boolean[] = [];
    for (let i = 0; i < POLITICA.max + 2; i++) {
      const r = await checkRateLimitShared("auth", id, POLITICA);
      veredictos.push(r.allowed);
    }

    // Cinco `true`, depois `false` — a fronteira exata.
    expect(veredictos).toEqual([true, true, true, true, true, false, false]);
  });

  it("conta o `remaining` a descer até zero", async () => {
    const id = idNovo();
    const primeiros: number[] = [];
    for (let i = 0; i < POLITICA.max; i++) {
      primeiros.push((await checkRateLimitShared("auth", id, POLITICA)).remaining);
    }

    expect(primeiros).toEqual([4, 3, 2, 1, 0]);
  });

  /*
   * ────────────────────────────────────────────────────────────────────────
   *  A CORRIDA — o coração desta frente do rate limiting
   * ────────────────────────────────────────────────────────────────────────
   *
   * 20 pedidos em paralelo contra um balde de `max=5`. Se o incremento fosse
   * um read-modify-write sem trinco (o defeito clássico dos contadores), vários
   * liam "ainda cabe" antes de qualquer escrita e passavam a mais. O
   * `INSERT … ON CONFLICT` tranca a linha, por isso a resposta é sempre 5.
   */
  it("com 20 pedidos em paralelo aceita exatamente `max`", async () => {
    const id = idNovo();
    const PEDIDOS = 20;

    const resultados = cumpridos(
      await emParalelo(PEDIDOS, () => checkRateLimitShared("auth", id, POLITICA)),
    );

    const aceites = resultados.filter((r) => r.allowed).length;
    expect(aceites).toBe(POLITICA.max);
    expect(resultados).toHaveLength(PEDIDOS);
  });

  it("repete o resultado da corrida em várias rondas (determinismo)", async () => {
    const aceitesPorRonda: number[] = [];
    for (let ronda = 0; ronda < 5; ronda++) {
      const id = idNovo();
      const resultados = cumpridos(
        await emParalelo(20, () => checkRateLimitShared("auth", id, POLITICA)),
      );
      aceitesPorRonda.push(resultados.filter((r) => r.allowed).length);
    }

    // Sempre 5, ronda após ronda — nada de depender do escalonador.
    expect(aceitesPorRonda).toEqual([5, 5, 5, 5, 5]);
  });

  it("baldes de chaves diferentes não se misturam", async () => {
    const a = idNovo();
    const b = idNovo();

    // Esgota o balde de A.
    for (let i = 0; i < POLITICA.max; i++) await checkRateLimitShared("auth", a, POLITICA);
    const aDepois = await checkRateLimitShared("auth", a, POLITICA);
    // B está intacto.
    const bPrimeiro = await checkRateLimitShared("auth", b, POLITICA);

    expect(aDepois.allowed).toBe(false);
    expect(bPrimeiro.allowed).toBe(true);
  });

  it("o mesmo id em scopes diferentes conta em baldes separados", async () => {
    const id = idNovo();

    for (let i = 0; i < POLITICA.max; i++) await checkRateLimitShared("auth", id, POLITICA);
    const auth = await checkRateLimitShared("auth", id, POLITICA);
    const checkout = await checkRateLimitShared("checkout", id, POLITICA);

    expect(auth.allowed).toBe(false);
    expect(checkout.allowed).toBe(true);
  });

  /*
   * A janela reabre. Sem esperar 60 s reais: empurra-se `window_started_at` para
   * o passado, para lá da janela, e o pedido seguinte tem de reiniciar a contar.
   */
  it("reinicia a contagem quando a janela expira", async () => {
    const id = idNovo();
    for (let i = 0; i < POLITICA.max; i++) await checkRateLimitShared("auth", id, POLITICA);
    expect((await checkRateLimitShared("auth", id, POLITICA)).allowed).toBe(false);

    // Envelhece a janela para além do limite.
    await db.execute(
      sql`update rate_limit_hits set window_started_at = now() - interval '2 minutes'
          where key = ${`auth:${id}`}`,
    );

    const depoisDeExpirar = await checkRateLimitShared("auth", id, POLITICA);
    expect(depoisDeExpirar.allowed).toBe(true);
    expect(depoisDeExpirar.remaining).toBe(POLITICA.max - 1);
  });
});
