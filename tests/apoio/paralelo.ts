/*
 * ============================================================================
 *  CORRIDAS A SÉRIO — como se testa concorrência sem `sleep` e sem sorte
 * ============================================================================
 *
 * Os três bugs que motivaram esta suite eram todos de concorrência, e nenhum
 * apareceu a ler código. Um teste que os apanhe tem de cumprir duas coisas que
 * um `Promise.all` ingénuo não cumpre:
 *
 *  1. AS TAREFAS TÊM DE COMEÇAR JUNTAS. Num `Promise.all` normal a primeira
 *     tarefa já está a falar com a base de dados enquanto a oitava ainda nem
 *     foi construída. Quando o arranque é mais lento do que a operação, não há
 *     sobreposição nenhuma: o teste passa sempre e não prova nada. Foi
 *     exatamente o que aconteceu na medição original dos eventos duplicados —
 *     a única ronda que "passou" foi a primeira, com o servidor frio.
 *
 *     A `barreira` resolve isto sem temporizadores: cada tarefa avisa que
 *     chegou e fica à espera; quando a última chega, todas são libertadas na
 *     mesma volta do event loop. Não há `sleep` a torcer para que corra bem.
 *
 *  2. O QUE SE VERIFICA É O INVARIANTE, NÃO A ORDEM. Qual das oito escritas
 *     ganha é indiferente e varia a cada corrida — o que não pode variar é
 *     "ficou exatamente um dono" ou "ficou exatamente um evento". Um teste
 *     escrito sobre o invariante dá o mesmo resultado em 100 corridas mesmo
 *     com o escalonador a mudar de ideias.
 *
 * A terceira peça é o número de RONDAS. Uma corrida só pode não apanhar a
 * janela; repetir R vezes faz a probabilidade de escapar cair a R-ésima
 * potência. Ver `tests/concorrencia/_canario.test.ts`, que mede a taxa a que
 * o código sem guarda falha e justifica o R escolhido.
 */

/** Liberta N tarefas ao mesmo tempo. */
export type Barreira = () => Promise<void>;

/**
 * Cria uma barreira para `total` participantes.
 *
 * Cada tarefa chama `await barreira()` no ponto onde quer começar em conjunto.
 * As primeiras `total - 1` ficam suspensas; a última liberta todas de uma vez.
 */
export function criarBarreira(total: number): Barreira {
  let chegaram = 0;
  let libertar!: () => void;
  const porta = new Promise<void>((resolve) => {
    libertar = resolve;
  });

  return () => {
    chegaram += 1;
    if (chegaram >= total) libertar();
    return porta;
  };
}

/**
 * Corre `tarefa` `n` vezes em paralelo, todas libertadas no mesmo instante.
 *
 * Devolve o resultado de cada uma — incluindo as que rebentaram, porque numa
 * corrida uma exceção (violação de unicidade, deadlock) é um resultado
 * legítimo e o teste tem de a poder ver em vez de morrer com ela.
 */
export async function emParalelo<T>(
  n: number,
  tarefa: (indice: number) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  const barreira = criarBarreira(n);
  return Promise.allSettled(
    Array.from({ length: n }, async (_, i) => {
      await barreira();
      return tarefa(i);
    }),
  );
}

/** Só os resultados que correram bem. */
export function cumpridos<T>(resultados: PromiseSettledResult<T>[]): T[] {
  return resultados
    .filter((r): r is PromiseFulfilledResult<T> => r.status === "fulfilled")
    .map((r) => r.value);
}
