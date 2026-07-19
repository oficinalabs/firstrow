import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { channelMembers } from "@/db/schema";
import { db, limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { criarCanaisComDonos } from "../apoio/fabrica";
import { emParalelo } from "../apoio/paralelo";
import { donosDe, RONDAS } from "./partilhado";

/*
 * ============================================================================
 *  O CANÁRIO — o teste que testa os testes
 * ============================================================================
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * Um teste de concorrência tem um modo de falhar que não faz barulho nenhum:
 * deixar de haver corrida. Se as tarefas passarem a arrancar em fila — porque
 * o pool encolheu, porque a barreira se partiu num refactor, porque alguém
 * meteu um `await` a mais — os testes de concorrência ao lado continuam todos
 * verdes e deixam de provar seja o que for. Ficava uma rede de segurança
 * pintada no chão.
 *
 * Este ficheiro é a prova viva de que a corrida acontece mesmo. Corre o padrão
 * ANTIGO — a condição no `where`, sem trinco nenhum — e exige que ele PARTA.
 * É a versão que foi medida a deixar 16 em 20 canais sem dono.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O NÚMERO DE RONDAS NÃO É UM PALPITE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Medido nesta base, com esta barreira: o padrão sem trinco deixa o canal sem
 * dono em **21 de 30 rondas** (70%). Uma ronda sozinha escapava-se 3 vezes em
 * 10, o que dava um teste intermitente — o pior tipo de teste, porque ensina
 * as pessoas a carregar em "repetir".
 *
 * Com R rondas, a hipótese de o canário passar por engano é 0,30^R:
 *
 *      R=1 → 30%      R=5 → 2,4‰      R=8 → 6,5×10⁻⁵     R=12 → 5,3×10⁻⁷
 *
 * Está em 12. Uma falsa passagem a cada dois milhões de corridas é menos
 * provável do que o CI ficar sem rede a meio.
 *
 * SE ESTE TESTE FALHAR, não corrijas o canário: os testes ao lado deixaram de
 * exercitar concorrência e é isso que tem de ser reparado.
 */

/**
 * A remoção COMO ERA ANTES do trinco: a condição vive toda dentro do `where`.
 *
 * Fica aqui congelada de propósito. Não é para reaproveitar nem para manter
 * alinhada com `server/channel-members.ts` — é a peça de museu contra a qual
 * se mede se a corrida ainda acontece.
 *
 * A razão de isto não funcionar: em READ COMMITTED, dois DELETE em LINHAS
 * DIFERENTES não se bloqueiam, e o `exists` de cada um corre sobre um
 * instantâneo anterior à escrita do outro. Ambos veem o outro dono ainda de
 * pé, ambos concluem que podem sair, e o canal fica sem ninguém.
 */
async function removerSemTrinco(channelId: string, userId: string) {
  return db
    .delete(channelMembers)
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        eq(channelMembers.userId, userId),
        sql`(
          ${channelMembers.role} <> 'owner'
          or exists (
            select 1 from ${channelMembers} outro
             where outro.channel_id = ${channelId}
               and outro.role = 'owner'
               and outro.user_id <> ${userId}
          )
        )`,
      ),
    )
    .returning({ userId: channelMembers.userId });
}

describe.skipIf(!temBaseDeDados())("canário da concorrência", () => {
  beforeEach(limparBase);

  it(`o padrão sem trinco deixa canais sem dono (em ${RONDAS} rondas)`, async () => {
    const canais = await criarCanaisComDonos(RONDAS);
    let rondasSemDono = 0;

    for (const { canal, donos } of canais) {
      // Os dois donos saem ao mesmo tempo — linhas diferentes, que é
      // precisamente o caso que os trincos de linha não serializam.
      await emParalelo(donos.length, (i) => removerSemTrinco(canal.id, donos[i].id));

      if ((await donosDe(canal.id)) === 0) rondasSemDono += 1;
    }

    expect(
      rondasSemDono,
      "A corrida deixou de acontecer: os testes de concorrência ao lado já não " +
        "provam nada. Repara a barreira ou o paralelismo, não este teste.",
    ).toBeGreaterThan(0);
  });
});
