import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * ============================================================================
 *  O CAMINHO ÚNICO DE "PAGARAM" A "TEM ACESSO" (server/fulfilment.ts)
 * ============================================================================
 *
 * Desde a Frente I, webhook e reconciliação convergem AQUI: `settlePurchase`
 * confirma com a Eupago e `grantAndNotify` transita o estado e envia o recibo.
 * É o sítio mais denso de regras de dinheiro da plataforma, e cada uma tem o
 * seu teste:
 *
 *   · a transição de estado é a fechadura da idempotência — N chamadas
 *     CONCORRENTES dão 1 ativação e, sobretudo, **1 email** (o email sai da
 *     transição, não da confirmação);
 *   · o prefixo do identifier decide o destino (tkt_ → bilhete, uuid → PPV);
 *   · o texto de consentimento aceite na compra viaja no recibo (Frente J);
 *   · `settlePurchase` não toca em NADA quando a Eupago diz "por pagar".
 *
 * O email é substituído por um espião: o que se conta é quantas vezes o
 * caminho único DECIDIU enviar. A Resend não tem lugar numa suite.
 */

/** O que o caminho único entrega ao email — só os campos que os testes leem. */
type ReciboEnviado = {
  emailConta: string;
  eventoTitulo: string;
  valorCents: number;
  numeroRecibo?: string;
  textoConsentido?: string;
};

const enviados = vi.fn(async (_recibo: ReciboEnviado) => ({ sent: true }));
vi.mock("@/lib/email", () => ({ sendReceiptEmail: enviados }));

/** O recibo da n-ésima chamada ao email (0-based), com o tipo já apertado. */
function reciboEnviado(n = 0): ReciboEnviado {
  const chamada = enviados.mock.calls[n];
  if (!chamada) throw new Error(`o email só foi chamado ${enviados.mock.calls.length} vez(es)`);
  return chamada[0];
}

const { entitlements, tickets } = await import("@/db/schema");
const { grantAndNotify, purchaseKindOf, settlePurchase } = await import("@/server/fulfilment");
const { guardarConsentimento } = await import("@/server/consents");
const { db, limparBase, temBaseDeDados } = await import("../apoio/base-de-dados");
const { cenarioBase, criarBilhete, criarEntitlement } = await import("../apoio/fabrica");
const { cumpridos, emParalelo } = await import("../apoio/paralelo");

const CHAMADAS_CONCORRENTES = 8;

/** A resposta da Eupago que `settlePurchase` vai encontrar, sem rede nenhuma. */
function eupagoResponde(corpo: unknown): void {
  vi.stubGlobal(
    "fetch",
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => corpo,
        text: async () => JSON.stringify(corpo),
      }) as unknown as Response,
  );
}

describe("purchaseKindOf", () => {
  it("despacha pelo prefixo do identifier", () => {
    expect(purchaseKindOf("tkt_9b2f8c34")).toBe("ticket");
    expect(purchaseKindOf("55e51a44-9d0a-4c3e-b0e5-1c1e64c1a000")).toBe("entitlement");
  });
});

describe.skipIf(!temBaseDeDados())("grantAndNotify", () => {
  beforeEach(async () => {
    await limparBase();
    enviados.mockClear();
  });

  it("ativa, envia um recibo com os dados certos, e diz 'ativada'", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    const resultado = await grantAndNotify(compra.id, "ref-1");

    expect(resultado).toBe("ativada");
    expect(enviados).toHaveBeenCalledTimes(1);
    const recibo = reciboEnviado();
    expect(recibo.emailConta).toBe(comprador.email);
    expect(recibo.eventoTitulo).toBe(evento.title);
    expect(recibo.valorCents).toBe(evento.priceCents);
    expect(recibo.numeroRecibo).toBe("ref-1");
  });

  it("uma repetição diz 'sem-efeito' e NÃO reenvia o email", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    await grantAndNotify(compra.id, "ref-1");
    const repeticao = await grantAndNotify(compra.id, "ref-1");

    expect(repeticao).toBe("sem-efeito");
    expect(enviados).toHaveBeenCalledTimes(1);
  });

  /*
   * O TESTE QUE O COORDENADOR PEDIU, e com razão: a Frente I mediu isto com
   * scripts descartáveis que já não existem. O webhook e a reconciliação podem
   * chegar AO MESMO TEMPO (é o cenário normal de um webhook atrasado), e o
   * cliente não pode receber dois recibos.
   *
   * As N chamadas partem juntas (barreira, ver tests/apoio/paralelo.ts). O
   * invariante não depende de quem ganha: 1 "ativada", N-1 "sem-efeito", e o
   * espião do email conta EXATAMENTE 1 envio.
   */
  it(`${CHAMADAS_CONCORRENTES} chamadas concorrentes dão 1 ativação e 1 email`, async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    const resultados = cumpridos(
      await emParalelo(CHAMADAS_CONCORRENTES, () => grantAndNotify(compra.id, "ref-1")),
    );

    expect(resultados.filter((r) => r === "ativada")).toHaveLength(1);
    expect(resultados.filter((r) => r === "sem-efeito")).toHaveLength(CHAMADAS_CONCORRENTES - 1);
    expect(enviados).toHaveBeenCalledTimes(1);

    const [linha] = await db.select().from(entitlements).where(eq(entitlements.id, compra.id));
    expect(linha.status).toBe("active");
    expect(linha.providerRef).toBe("ref-1");
  });

  it(`o mesmo em bilhetes: 1 QR e 1 email com ${CHAMADAS_CONCORRENTES} chamadas`, async () => {
    const { comprador, evento } = await cenarioBase();
    const bilhete = await criarBilhete(comprador.id, evento.id, { priceCents: 1500 });

    const resultados = cumpridos(
      await emParalelo(CHAMADAS_CONCORRENTES, () => grantAndNotify(bilhete.id, "ref-1")),
    );

    expect(resultados.filter((r) => r === "ativada")).toHaveLength(1);
    expect(enviados).toHaveBeenCalledTimes(1);
    // O recibo do bilhete leva o preço do BILHETE, não o preço PPV do evento.
    const recibo = reciboEnviado();
    expect(recibo.valorCents).toBe(1500);

    const [linha] = await db.select().from(tickets).where(eq(tickets.id, bilhete.id));
    expect(linha.status).toBe("issued");
    expect(linha.qrToken).toMatch(/^frt_/);
  });

  it("um identifier que não é de nada nosso dá 'sem-efeito' e zero emails", async () => {
    expect(await grantAndNotify("55e51a44-0000-0000-0000-000000000000", "ref-1")).toBe(
      "sem-efeito",
    );
    expect(await grantAndNotify("tkt_inexistente", "ref-1")).toBe("sem-efeito");
    expect(enviados).not.toHaveBeenCalled();
  });

  /*
   * A obrigação da Frente J dentro do caminho do dinheiro: o texto EXATO que a
   * pessoa aceitou tem de ir no recibo (secção 6 de docs/legal). Vive em
   * `grantAndNotify` — e não no webhook — para a reconciliação o levar também.
   */
  it("reproduz no recibo o texto de consentimento aceite na compra", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);
    const texto = "Aceito que a transmissão comece na data marcada e renuncio ao prazo de 14 dias.";

    await guardarConsentimento({
      compra: { tipo: "entitlement", id: compra.id },
      userId: comprador.id,
      userEmail: comprador.email,
      eventId: evento.id,
      eventTitle: evento.title,
      kind: "ppv",
      texto,
      versao: "v1",
      checkboxAceite: true,
      req: new Request("http://localhost/checkout", { headers: { "user-agent": "vitest" } }),
    });

    await grantAndNotify(compra.id, "ref-1");

    const recibo = reciboEnviado();
    expect(recibo.textoConsentido).toBe(texto);
  });

  it("sem registo de consentimento, o recibo sai na mesma — só sem essa secção", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    await grantAndNotify(compra.id, "ref-1");

    expect(enviados).toHaveBeenCalledTimes(1);
    const recibo = reciboEnviado();
    expect(recibo.textoConsentido).toBeUndefined();
  });
});

describe.skipIf(!temBaseDeDados())("settlePurchase", () => {
  beforeEach(async () => {
    await limparBase();
    enviados.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("com a Eupago a dizer 'paga', ativa e envia o recibo", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);
    eupagoResponde({ estado_referencia: "paga" });

    const resultado = await settlePurchase(compra.id, "ref-1");

    expect(resultado).toBe("ativada");
    expect(enviados).toHaveBeenCalledTimes(1);
  });

  /*
   * A notificação diz "vai ver"; quem manda é a resposta da Eupago. Uma
   * referência por pagar não pode mexer em NADA — nem estado, nem email. É a
   * porta que fecha o webhook 1.0 forjado.
   */
  it("com a referência por pagar, devolve 'por-pagar' e não toca em nada", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);
    eupagoResponde({ estado_referencia: "pendente" });

    const resultado = await settlePurchase(compra.id, "ref-1");

    expect(resultado).toBe("por-pagar");
    expect(enviados).not.toHaveBeenCalled();
    const [linha] = await db.select().from(entitlements).where(eq(entitlements.id, compra.id));
    expect(linha.status).toBe("pending");
    expect(linha.providerRef).toBeNull();
  });
});
