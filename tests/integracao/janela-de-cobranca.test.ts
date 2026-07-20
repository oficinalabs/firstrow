import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { entitlements, tickets } from "@/db/schema";
import { hasLiveCharge, recordChargeReference } from "@/server/purchases";
import { db, limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { cenarioBase, criarBilhete, criarEntitlement } from "../apoio/fabrica";

/*
 * ============================================================================
 *  A JANELA DA COBRANÇA — o que impede pagar duas vezes o mesmo acesso
 * ============================================================================
 *
 * A compra pendente é reutilizada a cada tentativa (de propósito: senão
 * acumulavam-se linhas e, nos bilhetes, lugares presos). Mas a COBRANÇA não
 * pode ser reutilizada às cegas — viu-se em sandbox três pedidos MB WAY de
 * 7,50 € com o mesmo identificador, um por clique. Em produção isso é o cliente
 * a receber três notificações no telemóvel, aceitar duas, e pagar duas vezes.
 *
 * A guarda: `recordChargeReference` carimba a hora do último pedido, e
 * `hasLiveCharge` diz se esse carimbo ainda está dentro da janela (5,5 min — os
 * 5 do MB WAY mais uma folga de relógio). Dentro da janela, o segundo pedido é
 * recusado; passada ela, repetir é legítimo porque o anterior já expirou do
 * lado da Eupago.
 *
 * Estes testes mexem em `chargeRequestedAt` diretamente para simular o passar
 * do tempo — é determinístico e não precisa de esperar 5 minutos reais.
 */

/** A janela é 5,5 min; estes offsets ficam de cada lado da fronteira. */
const DENTRO_DA_JANELA_MS = 5 * 60 * 1000; // 5 min — ainda viva
const FORA_DA_JANELA_MS = 6 * 60 * 1000; // 6 min — já expirou

describe.skipIf(!temBaseDeDados())("hasLiveCharge", () => {
  beforeEach(limparBase);

  it("é falso quando ainda não se pediu cobrança nenhuma", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    expect(await hasLiveCharge("entitlement", compra.id)).toBe(false);
  });

  it("é verdadeiro logo a seguir a registar a cobrança", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    await recordChargeReference("entitlement", compra.id, "ref-1");

    expect(await hasLiveCharge("entitlement", compra.id)).toBe(true);
  });

  it("continua vivo dentro da janela", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id, {
      chargeRequestedAt: new Date(Date.now() - DENTRO_DA_JANELA_MS),
    });

    expect(await hasLiveCharge("entitlement", compra.id)).toBe(true);
  });

  it("deixa de contar passada a janela — repetir é legítimo", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id, {
      chargeRequestedAt: new Date(Date.now() - FORA_DA_JANELA_MS),
    });

    expect(await hasLiveCharge("entitlement", compra.id)).toBe(false);
  });

  it("vale também para bilhetes, na sua própria tabela", async () => {
    const { comprador, evento } = await cenarioBase();
    const bilhete = await criarBilhete(comprador.id, evento.id);

    expect(await hasLiveCharge("ticket", bilhete.id)).toBe(false);
    await recordChargeReference("ticket", bilhete.id, "ref-1");
    expect(await hasLiveCharge("ticket", bilhete.id)).toBe(true);
  });
});

describe.skipIf(!temBaseDeDados())("recordChargeReference", () => {
  beforeEach(limparBase);

  it("guarda a referência da Eupago quando ela vem", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    await recordChargeReference("entitlement", compra.id, "ref-eupago-123");

    const [linha] = await db.select().from(entitlements).where(eq(entitlements.id, compra.id));
    expect(linha.providerRef).toBe("ref-eupago-123");
    expect(linha.chargeRequestedAt).not.toBeNull();
  });

  /*
   * A hora carimba-se SEMPRE, mesmo quando a Eupago não devolve referência: é
   * a hora que fecha a janela contra a cobrança repetida, e essa guarda não
   * pode depender de um campo opcional da resposta deles.
   */
  it("carimba a hora mesmo sem referência", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    await recordChargeReference("entitlement", compra.id, null);

    const [linha] = await db.select().from(entitlements).where(eq(entitlements.id, compra.id));
    expect(linha.chargeRequestedAt).not.toBeNull();
    expect(linha.providerRef).toBeNull();
    // E a janela conta a partir daqui.
    expect(await hasLiveCharge("entitlement", compra.id)).toBe(true);
  });

  it("não apaga uma referência anterior quando a nova vem vazia", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    await recordChargeReference("entitlement", compra.id, "ref-primeira");
    await recordChargeReference("entitlement", compra.id, null);

    const [linha] = await db.select().from(entitlements).where(eq(entitlements.id, compra.id));
    expect(linha.providerRef).toBe("ref-primeira");
  });

  it("escreve na tabela certa conforme o tipo", async () => {
    const { comprador, evento } = await cenarioBase();
    const bilhete = await criarBilhete(comprador.id, evento.id);

    await recordChargeReference("ticket", bilhete.id, "ref-bilhete");

    const [linha] = await db.select().from(tickets).where(eq(tickets.id, bilhete.id));
    expect(linha.providerRef).toBe("ref-bilhete");
  });
});
