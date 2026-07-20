import { beforeEach, describe, expect, it } from "vitest";
import { removeChannelMember, setChannelMemberByEmail } from "@/server/channel-members";
import { limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { criarCanaisComDonos, criarCanal, criarMembro, criarUtilizador } from "../apoio/fabrica";
import { cumpridos, emParalelo } from "../apoio/paralelo";
import { donosDe, RONDAS } from "./partilhado";

/*
 * ============================================================================
 *  UM CANAL NUNCA FICA SEM DONO
 * ============================================================================
 *
 * PORQUE É QUE ISTO CUSTA DINHEIRO
 *
 * O dono do canal é quem gere os eventos e vê o dinheiro dele. Um canal sem
 * dono é uma liga trancada fora da sua própria bilheteira, a meio de uma
 * venda, e sem forma de lá voltar sem alguém mexer na base de dados à mão.
 *
 * PORQUE É QUE ESTE TESTE É EM PARALELO E NÃO EM SÉRIE
 *
 * Em série isto passa sempre, com ou sem trinco: o segundo pedido vê o
 * primeiro já comprometido e recusa-se, como deve. O bug só existe quando os
 * dois correm ao mesmo tempo — e foi medido, no padrão antigo, a deixar 16 em
 * 20 canais sem dono nenhum.
 *
 * O caso que quebra o padrão antigo é este: os dois donos saem AO MESMO TEMPO.
 * São linhas DIFERENTES da mesma tabela, e trincos de linha só põem em fila
 * quem disputa a MESMA linha. Sem um ponto de encontro — a linha do canal,
 * trancada com `for update` — cada um avalia "há outro dono?" sobre um
 * instantâneo onde o outro ainda lá está.
 *
 * O invariante não depende de quem ganha a corrida, e é por isso que este
 * teste dá o mesmo resultado em todas as corridas: sobra sempre pelo menos um
 * dono. Qual deles é indiferente.
 *
 * O `canario.test.ts` ao lado prova que estas rondas exercitam mesmo a
 * corrida — sem ele, um verde aqui não queria dizer nada.
 */

describe.skipIf(!temBaseDeDados())("invariante do dono do canal", () => {
  beforeEach(limparBase);

  /*
   * As rondas partilham UMA montagem em lote (três INSERTs para os 12 canais e
   * os seus donos), e cada ronda mexe no seu canal. Não é só velocidade: um
   * cenário montado linha a linha, ronda a ronda, gastava mais tempo a preparar
   * do que a medir, e uma suite lenta é uma suite que se deixa de correr — e aí
   * a regressão volta sem ninguém dar por ela.
   */
  it(`sobra sempre um dono com duas saídas em paralelo (${RONDAS} rondas)`, async () => {
    const canais = await criarCanaisComDonos(RONDAS);
    const semDono: string[] = [];

    for (const { canal, donos } of canais) {
      await emParalelo(donos.length, (i) => removeChannelMember(canal.id, donos[i].id));
      if ((await donosDe(canal.id)) === 0) semDono.push(canal.id);
    }

    expect(semDono).toEqual([]);
  });

  it(`sobra sempre um dono com duas despromoções em paralelo (${RONDAS} rondas)`, async () => {
    const canais = await criarCanaisComDonos(RONDAS);
    const semDono: string[] = [];

    for (const { canal, donos } of canais) {
      // Despromover a si próprio é a outra porta para o mesmo buraco: dois
      // donos a passarem-se a `staff` ao mesmo tempo deixavam o canal vazio.
      await emParalelo(donos.length, (i) =>
        setChannelMemberByEmail(canal.id, donos[i].email, "staff"),
      );
      if ((await donosDe(canal.id)) === 0) semDono.push(canal.id);
    }

    expect(semDono).toEqual([]);
  });

  it(`sobra sempre um dono quando um sai e o outro se despromove (${RONDAS} rondas)`, async () => {
    const canais = await criarCanaisComDonos(RONDAS);
    const semDono: string[] = [];

    for (const { canal, donos } of canais) {
      const [aSair, aDespromover] = donos;
      // As duas mutações são caminhos de código diferentes (DELETE e UPSERT).
      // Se só uma delas trancasse o canal, elas cruzavam-se à mesma.
      await emParalelo(2, (i) =>
        i === 0
          ? removeChannelMember(canal.id, aSair.id)
          : setChannelMemberByEmail(canal.id, aDespromover.email, "staff"),
      );
      if ((await donosDe(canal.id)) === 0) semDono.push(canal.id);
    }

    expect(semDono).toEqual([]);
  });

  /*
   * Segurar o invariante não chega: quem foi recusado tem de saber PORQUÊ. Sem
   * isto, o ecrã dizia "feito" a uma remoção que não aconteceu, e o dono só
   * descobria ao recarregar a página.
   */
  it("diz `last-owner` a quem foi recusado, e só a esse", async () => {
    const canal = await criarCanal();
    const donos = await Promise.all([criarUtilizador(), criarUtilizador()]);
    for (const dono of donos) await criarMembro(canal.id, dono.id, "owner");

    const resultados = cumpridos(
      await emParalelo(donos.length, (i) => removeChannelMember(canal.id, donos[i].id)),
    );

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok && r.reason === "last-owner")).toHaveLength(1);
  });

  /*
   * Canais diferentes não se podem estorvar: o trinco é na linha do canal, não
   * na tabela. Se alguém o trocasse por um trinco global, duas ligas a mexer
   * na equipa ao mesmo tempo passavam a esperar uma pela outra — e isto
   * apanhava-o.
   */
  it("deixa canais diferentes mexer nos membros ao mesmo tempo", async () => {
    const canais = await Promise.all([criarCanal(), criarCanal()]);
    const equipas = await Promise.all(
      canais.map(async (canal) => {
        const donos = await Promise.all([criarUtilizador(), criarUtilizador()]);
        for (const dono of donos) await criarMembro(canal.id, dono.id, "owner");
        return { canal, donos };
      }),
    );

    const resultados = cumpridos(
      await emParalelo(equipas.length, (i) =>
        removeChannelMember(equipas[i].canal.id, equipas[i].donos[0].id),
      ),
    );

    // Cada canal tinha dois donos: tirar um de cada é legítimo nos dois.
    expect(resultados.every((r) => r.ok)).toBe(true);
    for (const { canal } of equipas) {
      expect(await donosDe(canal.id)).toBe(1);
    }
  });

  it("recusa tirar o único dono de um canal", async () => {
    const canal = await criarCanal();
    const dono = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");

    const resultado = await removeChannelMember(canal.id, dono.id);

    expect(resultado).toEqual({ ok: false, reason: "last-owner" });
    expect(await donosDe(canal.id)).toBe(1);
  });

  it("deixa sair um `staff` sem discussão nenhuma", async () => {
    const canal = await criarCanal();
    const [dono, equipa] = await Promise.all([criarUtilizador(), criarUtilizador()]);
    await criarMembro(canal.id, dono.id, "owner");
    await criarMembro(canal.id, equipa.id, "staff");

    await expect(removeChannelMember(canal.id, equipa.id)).resolves.toEqual({ ok: true });
    expect(await donosDe(canal.id)).toBe(1);
  });
});
