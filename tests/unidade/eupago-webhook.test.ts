import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseWebhook1,
  parseWebhook2,
  verifyWebhook1Key,
  verifyWebhookSignature,
} from "@/lib/eupago";

/*
 * ============================================================================
 *  O WEBHOOK DA EUPAGO — a porta por onde entra "isto está pago"
 * ============================================================================
 *
 * É a superfície mais perigosa da aplicação: quem conseguir forjar uma
 * notificação aceite emite bilhetes sem pagar. E já houve aqui um bug que não
 * dava erro nenhum — o `identifier` era lido na RAIZ do corpo quando vem
 * dentro de `transactions`, e o resultado era o webhook responder 200 sem
 * ativar coisa nenhuma. Silencioso: pagamentos a entrar, acessos a não sair.
 *
 * Os testes deste ficheiro cobrem as quatro perguntas que interessam:
 *   1. uma assinatura válida é aceite;
 *   2. uma assinatura forjada é recusada;
 *   3. um corpo encriptado é lido;
 *   4. o `identifier` é encontrado onde ele vem mesmo.
 */

// O mesmo valor que `vitest.config.ts` põe no ambiente. Tem de ter EXATAMENTE
// 32 bytes: é usado como chave AES-256 na desencriptação do corpo.
const SEGREDO = "segredo-de-teste-com-32-bytes!!!";

function assinar(carga: string): string {
  return createHmac("sha256", SEGREDO).update(carga).digest("base64");
}

/** Encripta como a Eupago faz quando o canal tem "Encriptar Webhook: Sim". */
function encriptar(claro: string): { corpo: string; iv: string } {
  const iv = randomBytes(16);
  const cifra = createCipheriv("aes-256-cbc", Buffer.from(SEGREDO), iv);
  const dados = Buffer.concat([cifra.update(claro, "utf8"), cifra.final()]).toString("base64");
  return { corpo: JSON.stringify({ data: dados }), iv: iv.toString("base64") };
}

describe("verifyWebhookSignature", () => {
  it("aceita a assinatura calculada sobre o corpo cru", () => {
    const corpo = JSON.stringify({ transactions: { identifier: "abc", status: "Paid" } });

    expect(verifyWebhookSignature(corpo, assinar(corpo))).toBe(true);
  });

  it("aceita a assinatura calculada só sobre o campo data", () => {
    const dados = "carga-encriptada-em-base64";
    const corpo = JSON.stringify({ data: dados });

    expect(verifyWebhookSignature(corpo, assinar(dados))).toBe(true);
  });

  it("recusa uma assinatura forjada", () => {
    const corpo = JSON.stringify({ transactions: { identifier: "abc", status: "Paid" } });
    const forjada = createHmac("sha256", "outro-segredo").update(corpo).digest("base64");

    expect(verifyWebhookSignature(corpo, forjada)).toBe(false);
  });

  it("recusa quando o corpo foi alterado depois de assinado", () => {
    const original = JSON.stringify({ transactions: { identifier: "abc", status: "Paid" } });
    const assinatura = assinar(original);
    const adulterado = JSON.stringify({ transactions: { identifier: "OUTRO", status: "Paid" } });

    expect(verifyWebhookSignature(adulterado, assinatura)).toBe(false);
  });

  it("recusa quando não vem assinatura nenhuma", () => {
    expect(verifyWebhookSignature("{}", null)).toBe(false);
    expect(verifyWebhookSignature("{}", "")).toBe(false);
  });

  /*
   * Uma assinatura de tamanho diferente não pode rebentar o `timingSafeEqual`
   * — se rebentasse, a rota devolvia 500 em vez de recusar, e um atacante
   * tinha um oráculo grátis para distinguir "malformada" de "errada".
   */
  it("recusa uma assinatura truncada sem rebentar", () => {
    const corpo = "{}";

    expect(verifyWebhookSignature(corpo, assinar(corpo).slice(0, 10))).toBe(false);
    expect(verifyWebhookSignature(corpo, "não é base64 $$$")).toBe(false);
  });
});

describe("verifyWebhook1Key", () => {
  it("aceita a chave da API e recusa qualquer outra", () => {
    expect(verifyWebhook1Key(process.env.EUPAGO_API_KEY ?? "")).toBe(true);
    expect(verifyWebhook1Key("chave-errada")).toBe(false);
    expect(verifyWebhook1Key(null)).toBe(false);
    expect(verifyWebhook1Key("")).toBe(false);
  });
});

describe("parseWebhook2", () => {
  /*
   * ESTE É O TESTE DO BUG. A Eupago manda a transação DENTRO de `transactions`;
   * ler na raiz devolvia `identifier: undefined`, o webhook respondia 200 e não
   * ativava nada. Não havia erro, não havia log, não havia acesso.
   */
  it("encontra o identifier dentro de transactions", () => {
    const corpo = JSON.stringify({
      transactions: {
        identifier: "ent_123",
        reference: 998877,
        status: "Paid",
        amount: { value: 7.5 },
      },
    });

    expect(parseWebhook2(corpo)).toEqual({
      identifier: "ent_123",
      reference: "998877",
      status: "Paid",
      amountCents: 750,
    });
  });

  it("aceita também a forma achatada, sem transactions", () => {
    const corpo = JSON.stringify({
      identifier: "tkt_456",
      reference: "112233",
      status: "Paid",
      amount: { value: 10 },
    });

    expect(parseWebhook2(corpo)?.identifier).toBe("tkt_456");
  });

  it("lê um corpo encriptado com o vetor de inicialização do header", () => {
    const claro = JSON.stringify({
      transactions: { identifier: "ent_789", reference: "555", status: "Paid" },
    });
    const { corpo, iv } = encriptar(claro);

    expect(parseWebhook2(corpo, iv)?.identifier).toBe("ent_789");
  });

  it("devolve null quando o corpo não é JSON", () => {
    expect(parseWebhook2("isto não é json")).toBeNull();
  });

  it("devolve null quando falta o identifier ou o status", () => {
    expect(parseWebhook2(JSON.stringify({ transactions: { status: "Paid" } }))).toBeNull();
    expect(parseWebhook2(JSON.stringify({ transactions: { identifier: "x" } }))).toBeNull();
  });

  it("aceita os estados que não são pagamento, para o webhook os poder tratar", () => {
    for (const status of ["Refund", "Error", "Cancel", "Expired"]) {
      const corpo = JSON.stringify({ transactions: { identifier: "ent_1", status } });

      expect(parseWebhook2(corpo)?.status).toBe(status);
    }
  });

  it("deixa amountCents a null quando a Eupago não manda valor", () => {
    const corpo = JSON.stringify({ transactions: { identifier: "ent_1", status: "Paid" } });

    expect(parseWebhook2(corpo)?.amountCents).toBeNull();
  });
});

describe("parseWebhook1", () => {
  it("lê a notificação da query string e converte o valor para cêntimos", () => {
    const params = new URLSearchParams({
      identificador: "ent_abc",
      referencia: "123456",
      valor: "7.50",
    });

    expect(parseWebhook1(params)).toEqual({
      identifier: "ent_abc",
      reference: "123456",
      status: "Paid",
      amountCents: 750,
    });
  });

  /*
   * "2.31" em vírgula flutuante é 2.3099999999999996; sem arredondar dava 230
   * cêntimos em vez de 231. Um cêntimo por transação é um cêntimo a mais nas
   * discrepâncias de reconciliação.
   */
  it("não perde o cêntimo do arredondamento binário", () => {
    const params = new URLSearchParams({ identificador: "x", valor: "2.31" });

    expect(parseWebhook1(params)?.amountCents).toBe(231);
  });

  it("devolve null sem identificador", () => {
    expect(parseWebhook1(new URLSearchParams({ valor: "7.50" }))).toBeNull();
  });

  it("deixa amountCents a null quando o valor não é um número", () => {
    const params = new URLSearchParams({ identificador: "x", valor: "" });

    expect(parseWebhook1(params)?.amountCents).toBeNull();
  });
});
