import { beforeEach, describe, expect, it } from "vitest";
import { createPendingEntitlement } from "@/server/entitlements";
import { hasLiveCharge, recordChargeReference } from "@/server/purchases";
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
 *  ⚠️  BUG CONHECIDO — ESTE TESTE ESTÁ MARCADO `it.fails()` DE PROPÓSITO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A guarda atual é um check-then-act: lê `hasLiveCharge`, e só DEPOIS carimba
 * com `recordChargeReference`. Entre o ler e o carimbar não há atomicidade, por
 * isso dois pedidos simultâneos veem AMBOS "não há cobrança viva" e cobram os
 * dois. Medido nesta base: **11 de 12 rondas cobraram a dobrar** (só a primeira,
 * com a ligação fria, escapou — o mesmo padrão do bug dos eventos duplicados).
 *
 * A guarda foi desenhada para o caso SEQUENCIAL (clique a clique, ver o commit
 * #37) e esse funciona — o teste a seguir prova-o. O que falta fechar é o caso
 * verdadeiramente simultâneo.
 *
 * Isto vive em `server/purchases.ts` + `app/api/checkout/[eventId]/route.ts`,
 * que são da Frente I/J — NÃO desta frente. Por isso não se corrige aqui.
 *
 * `it.fails()` faz duas coisas: mantém a suite verde enquanto o bug existir
 * (documentado, não escondido), e VIRA A VERMELHO no dia em que alguém o
 * corrigir — aí este teste "passa" inesperadamente e obriga a trocá-lo por um
 * `it()` normal. A regressão deixa de poder voltar em silêncio.
 *
 * A correção provável (para quem for dono): tornar o "reservar a cobrança"
 * atómico — um UPDATE condicional que carimbe `chargeRequestedAt` só se ele
 * ainda estiver fora da janela, e agir pelo nº de linhas devolvidas. Aí o
 * `it.fails()` abaixo passa a `it()`.
 */

/** A tentativa de cobrança, tal como a rota a faz — sem a rede à Eupago. */
async function tentativaDeCobranca(entitlementId: string): Promise<"cobrado" | "recusado"> {
  if (await hasLiveCharge("entitlement", entitlementId)) return "recusado";
  await recordChargeReference("entitlement", entitlementId, "ref-de-teste");
  return "cobrado";
}

describe.skipIf(!temBaseDeDados())("cobrança repetida em paralelo", () => {
  beforeEach(limparBase);

  // MARCADO `it.fails()`: o corpo assere o invariante CERTO (uma só cobrança),
  // e esse invariante é hoje violado. Ver o cabeçalho do ficheiro.
  it.fails(`[BUG CONHECIDO] dois cliques simultâneos cobram no máximo uma vez (${RONDAS} rondas)`, async () => {
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
