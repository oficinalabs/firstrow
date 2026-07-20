import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { eventLikes } from "@/db/schema";
import { getLikes, toggleLike } from "@/server/chat";
import { db, limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { criarCanal, criarEvento, criarUtilizador } from "../apoio/fabrica";

/*
 * ============================================================================
 *  O GOSTO — um por conta, contagem pública, identidade privada
 * ============================================================================
 *
 * O que interessa provar:
 *
 *  1. UM POR CONTA, mesmo com dois cliques ao mesmo tempo. O botão é otimista e
 *     responde ao toque; num telemóvel com rede fraca, dois toques rápidos são
 *     dois pedidos em voo. Se a unicidade fosse decidida em JS ("já gostou?"),
 *     as duas verificações passavam e ficavam dois gostos — a mesma classe de
 *     erro que já custou eventos duplicados e cobranças repetidas nesta
 *     plataforma. Quem a segura é o índice único, e é isso que se mede aqui.
 *  2. A CONTAGEM É POR EVENTO, não global.
 *  3. O que a leitura devolve é um número e um booleano — nunca uma lista de
 *     pessoas. A privacidade de quem gostou é uma decisão de produto, e a forma
 *     mais segura de a garantir é não haver função nenhuma que a possa violar.
 */

describe.skipIf(!temBaseDeDados())("gosto num evento", () => {
  beforeEach(limparBase);

  it("alterna: gosto, deixo de gostar", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoa = await criarUtilizador();

    expect(await getLikes(evento.id, pessoa.id)).toEqual({ count: 0, liked: false });

    expect(await toggleLike(evento.id, pessoa.id)).toEqual({ count: 1, liked: true });
    expect(await toggleLike(evento.id, pessoa.id)).toEqual({ count: 0, liked: false });
    expect(await toggleLike(evento.id, pessoa.id)).toEqual({ count: 1, liked: true });
  });

  it("mostra a contagem a quem não tem sessão, sem lhe atribuir gosto nenhum", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoa = await criarUtilizador();
    await toggleLike(evento.id, pessoa.id);

    // `userId` a `null` é o anónimo: vê o número, não vota.
    expect(await getLikes(evento.id, null)).toEqual({ count: 1, liked: false });
  });

  it("conta uma vez por conta, não por clique", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const [a, b, c] = await Promise.all([criarUtilizador(), criarUtilizador(), criarUtilizador()]);

    await toggleLike(evento.id, a.id);
    await toggleLike(evento.id, b.id);
    await toggleLike(evento.id, c.id);

    expect((await getLikes(evento.id, a.id)).count).toBe(3);
  });

  it("não mistura eventos", async () => {
    const canal = await criarCanal();
    const [evento1, evento2] = await Promise.all([criarEvento(canal.id), criarEvento(canal.id)]);
    const pessoa = await criarUtilizador();

    await toggleLike(evento1.id, pessoa.id);

    expect((await getLikes(evento1.id, pessoa.id)).count).toBe(1);
    expect(await getLikes(evento2.id, pessoa.id)).toEqual({ count: 0, liked: false });
  });

  /*
   * ══════════════════════════════════════════════════════════════════════════
   *  O TESTE QUE MEDE, EM VEZ DE ACREDITAR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Oito inserções do MESMO gosto em paralelo. O que se conta é o número de
   * LINHAS na tabela — não o que a função devolve, que podia mentir com
   * elegância. Tem de ser 1.
   *
   * (As alternâncias em paralelo não são determinísticas por natureza: oito
   * "toggles" simultâneos podem acabar em 0 ou em 1 conforme a ordem, e é assim
   * mesmo. O invariante que NUNCA pode partir é nunca haver DUAS linhas para a
   * mesma conta e o mesmo evento — e é esse que se mede.)
   */
  it("oito gostos em simultâneo dão uma linha, nunca duas", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoa = await criarUtilizador();

    await Promise.all(
      Array.from({ length: 8 }, () =>
        db
          .insert(eventLikes)
          .values({ id: crypto.randomUUID(), eventId: evento.id, userId: pessoa.id })
          .onConflictDoNothing({ target: [eventLikes.eventId, eventLikes.userId] }),
      ),
    );

    const linhas = await db.select().from(eventLikes).where(eq(eventLikes.eventId, evento.id));

    expect(linhas).toHaveLength(1);
    expect((await getLikes(evento.id, pessoa.id)).count).toBe(1);
  });

  it("alternâncias em paralelo nunca deixam mais do que uma linha", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoa = await criarUtilizador();

    for (let ronda = 0; ronda < 6; ronda += 1) {
      await Promise.all(
        Array.from({ length: 4 }, () => toggleLike(evento.id, pessoa.id).catch(() => null)),
      );

      const linhas = await db.select().from(eventLikes).where(eq(eventLikes.eventId, evento.id));
      // 0 ou 1 conforme a ordem em que as alternâncias caíram; 2 seria o bug.
      expect(linhas.length).toBeLessThanOrEqual(1);
    }
  });
});
