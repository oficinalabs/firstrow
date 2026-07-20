import { beforeEach, describe, expect, it } from "vitest";
import { createPendingEntitlement } from "@/server/entitlements";
import { recordChargeReference, reserveCharge } from "@/server/purchases";
import { limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { cenarioBase } from "../apoio/fabrica";
import { cumpridos, emParalelo } from "../apoio/paralelo";
import { RONDAS } from "./partilhado";

/*
 * ============================================================================
 *  DOIS CLIQUES NÃO PODEM VIRAR DUAS COBRANÇAS
 * ============================================================================
 *
 * PORQUE É QUE ISTO CUSTA DINHEIRO — E É DINHEIRO DO CLIENTE
 *
 * Cada cobrança MB WAY faz o telemóvel da pessoa tocar com um pedido de 7,50 €.
 * Se dois pedidos partirem ao mesmo tempo (duplo-clique, dois separadores, o
 * browser a repetir o POST), a pessoa recebe duas notificações, pode aceitar as
 * duas, e paga duas vezes o mesmo acesso. Já se viu em sandbox: três pedidos
 * com o mesmo identificador, um por clique.
 *
 * O QUE ESTE TESTE MODELA
 *
 * A sequência exata do checkout (`app/api/checkout/[eventId]/route.ts`):
 *
 *     const ent = await createPendingEntitlement(user, event);  // reutilizado
 *     if (await hasLiveCharge("entitlement", ent.id)) return 409;
 *     ... createMbwayCharge ...          // ← a chamada de rede à Eupago
 *     await recordChargeReference("entitlement", ent.id, ref);
 *
 * Aqui a chamada de rede é omitida — o que só ENCURTA a janela entre o "ver" e
 * o "carimbar". Se a corrida aparecer mesmo assim, em produção (com a HTTP à
 * Eupago no meio) é pelo menos tão provável.
 *
 * O invariante DESEJADO: por muito que dois pedidos partam juntos, só um é
 * cobrado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  CORRIGIDO — a reserva passou a ser atómica (`reserveCharge`)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Este teste esteve marcado `it.fails()` a documentar um bug real: a guarda era
 * um check-then-act — lia `hasLiveCharge` e só DEPOIS carimbava. Sem atomicidade
 * entre o ler e o carimbar, dois pedidos simultâneos viam ambos "não há cobrança
 * viva" e cobravam os dois. Medido: **11 de 12 rondas cobravam a dobrar**.
 *
 * A correção (`server/purchases.ts` → `reserveCharge`) junta a condição da
 * janela e o carimbo no MESMO `UPDATE`: o Postgres tranca a linha, serializa os
 * pedidos, e só um ganha o slot. É a mesma correção do último dono e dos eventos
 * duplicados. O `it.fails()` virou `it()`: agora o invariante É verdade, e este
 * teste passa a ser a rede que impede o bug de voltar em silêncio.
 *
 * O `canario.test.ts` corre a par disto o padrão ANTIGO sem reserva atómica e
 * exige que ele PARTA — se um dia a corrida deixar de acontecer neste ambiente,
 * é o canário que acusa, para este verde não virar falsa segurança.
 */

/** A tentativa de cobrança, tal como a rota a faz — sem a rede à Eupago. */
async function tentativaDeCobranca(entitlementId: string): Promise<"cobrado" | "recusado"> {
  if (!(await reserveCharge("entitlement", entitlementId))) return "recusado";
  await recordChargeReference("entitlement", entitlementId, "ref-de-teste");
  return "cobrado";
}

describe.skipIf(!temBaseDeDados())("cobrança repetida em paralelo", () => {
  beforeEach(limparBase);

  it(`dois cliques simultâneos cobram no máximo uma vez (${RONDAS} rondas)`, async () => {
    const rondasComDupla: number[] = [];

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const { comprador, evento } = await cenarioBase();
      // createPendingEntitlement é idempotente: dois pedidos do mesmo par
      // user+event apanham a MESMA linha — como na rota.
      const ent = await createPendingEntitlement(comprador.id, evento.id);

      const resultados = cumpridos(await emParalelo(2, () => tentativaDeCobranca(ent.id)));
      const cobradas = resultados.filter((r) => r === "cobrado").length;
      if (cobradas > 1) rondasComDupla.push(ronda);
    }

    // Enquanto o bug existir, `rondasComDupla` não é vazio e esta asserção
    // falha — que é o que o `it.fails()` espera. Quando for corrigido, passa
    // a vazio, a asserção deixa de falhar, e o `it.fails()` acusa.
    expect(rondasComDupla).toEqual([]);
  });

  /*
   * O caso SEQUENCIAL — o que a guarda foi mesmo desenhada para apanhar (clique
   * a clique). Este tem de passar sempre: é o contrato documentado.
   */
  it("um segundo clique, já depois do primeiro, é recusado", async () => {
    const { comprador, evento } = await cenarioBase();
    const ent = await createPendingEntitlement(comprador.id, evento.id);

    const primeiro = await tentativaDeCobranca(ent.id);
    const segundo = await tentativaDeCobranca(ent.id);

    expect(primeiro).toBe("cobrado");
    expect(segundo).toBe("recusado");
  });
});
