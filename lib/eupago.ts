import "server-only";
import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/server-env";

// Guarda de build (ver lib/server-env.ts): chave da API da Eupago e segredo
// do webhook. Com o segredo do webhook, qualquer pessoa consegue forjar uma
// confirmação de pagamento e emitir bilhetes sem pagar.

function baseUrl(): string {
  return process.env.EUPAGO_ENV === "production"
    ? "https://clientes.eupago.pt"
    : "https://sandbox.eupago.pt";
}

// NOTA: a estrutura exata de `beneficiaries` (externKey por beneficiário) deve
// ser confirmada no backoffice/sandbox da Eupago. Ver docs/PAGAMENTOS.md.
export type SplitBeneficiary = {
  externKey: string;
  amount: number;
};

export type CreateSplitMbwayInput = {
  amountEur: number;
  phone: string; // alias MB WAY, ex: "351#912345678" ou "912345678"
  identifier: string;
  beneficiaries: SplitBeneficiary[];
  callbackUrl: string;
};

/**
 * Cobra por MB WAY, com split quando ele está configurado.
 *
 * O split precisa de uma `externKey` por beneficiário, criada no backoffice da
 * Eupago. Enquanto essas chaves não existirem, o comportamento diverge de
 * propósito conforme o ambiente:
 *
 *  · **produção** — recusa. Cobrar sem split fazia o dinheiro TODO entrar na
 *    conta da FirstRow, incluindo a parte da liga, e transformava um problema
 *    de configuração numa dívida a um cliente. Falhar a compra é menos mau.
 *  · **sandbox** — cobra por MB WAY simples e avisa no log. Não há dinheiro
 *    real, e sem isto era impossível testar o resto da cadeia (webhook,
 *    ativação, recibo) antes de a Eupago ativar o serviço de split.
 */
export async function createMbwayCharge(input: CreateSplitMbwayInput): Promise<unknown> {
  const apiKey = requireEnv("EUPAGO_API_KEY");
  const isProduction = process.env.EUPAGO_ENV === "production";

  const configurados = input.beneficiaries.filter((b) => b.externKey.trim() !== "");
  const comSplit = configurados.length > 0 && configurados.length === input.beneficiaries.length;

  if (!comSplit) {
    if (isProduction) {
      throw new Error(
        "Split por configurar (EUPAGO_LEAGUE_EXTERNKEY / EUPAGO_PLATFORM_EXTERNKEY): " +
          "compra recusada para não reter a parte da liga.",
      );
    }
    console.warn("[eupago] sandbox sem externKeys — a cobrar por MB WAY simples, sem split.");
  }

  const res = await fetch(
    `${baseUrl()}${comSplit ? "/api/v1/split-payments/mbway" : "/api/v1/mbway"}`,
    {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountEur,
        alias: input.phone,
        identifier: input.identifier,
        adminCallback: input.callbackUrl,
        lang: "PT",
        ...(comSplit ? { beneficiaries: input.beneficiaries } : {}),
      }),
    },
  );

  if (!res.ok) {
    // O corpo da resposta da Eupago vem no erro de propósito: é ele que diz se
    // o formato do pedido está errado, e é a única pista na primeira tentativa.
    throw new Error(`Eupago MB WAY falhou: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ *
 * Webhooks
 *
 * A Eupago tem DUAS gerações de webhook e nós temos de aceitar as duas,
 * porque a que se consegue ligar sozinho não é a boa:
 *
 *  - **1.0** — a única com auto-serviço (backoffice → Canais → editar canal →
 *    "Receber notificação para um URL"). Chega por **GET**, com os campos na
 *    query string, **sem assinatura**, e só dispara quando algo é PAGO.
 *  - **2.0** — POST com JSON, assinado em `X-Signature`, com política de
 *    repetição e todos os estados (pago, reembolso, erro, cancelado, expirado).
 *    Não aparece no backoffice: pede-se ao suporte da Eupago.
 *
 * Regra que atravessa as duas: **a notificação diz-nos para ir ver, não é
 * prova de nada.** Quem confirma o pagamento é a API da Eupago (ver
 * `confirmPaid`). No 1.0 isto não é opcional — sem assinatura, quem descobrir
 * o URL forjava uma confirmação e levava bilhetes de borla.
 * ------------------------------------------------------------------ */

export type PaymentStatus = "Paid" | "Refund" | "Error" | "Cancel" | "Expired";

/** Uma notificação já normalizada — a origem (1.0 ou 2.0) deixa de importar. */
export type PaymentNotification = {
  identifier: string;
  reference: string;
  status: PaymentStatus;
  /** Valor em cêntimos; `null` quando a origem não o traz de forma fiável. */
  amountCents: number | null;
};

function signatureMatches(payload: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Verifica o header X-Signature: HMAC-SHA256 em base64, com a "Chave
 * Criptográfica" gerada no canal da Eupago.
 *
 * Tentamos sobre duas formas porque a documentação não diz qual é o `$data`
 * assinado quando o corpo vem encriptado — se é o corpo todo, se é só o campo
 * `data`. Ambas são a mesma prova de autenticidade; o log diz qual acertou,
 * para se poder simplificar isto depois do primeiro webhook real.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = requireEnv("EUPAGO_WEBHOOK_SECRET");

  if (signatureMatches(rawBody, signatureHeader, secret)) return true;

  try {
    const { data } = JSON.parse(rawBody) as { data?: unknown };
    if (typeof data === "string" && signatureMatches(data, signatureHeader, secret)) {
      console.info('[eupago] assinatura confere sobre o campo "data".');
      return true;
    }
  } catch {
    // Corpo não-JSON: a assinatura sobre o corpo cru era a única hipótese.
  }
  return false;
}

/**
 * Desencripta o corpo quando o canal tem "Encriptar Webhook: Sim".
 *
 * Nesse modo a Eupago envia `{ data: "<base64 AES-256-CBC>" }` com o vetor de
 * inicialização no header `X-Initialization-Vector`. Tratamos os dois modos
 * para que a opção escolhida no backoffice não consiga partir a integração —
 * é um dropdown num formulário que ninguém se vai lembrar de rever.
 */
function decryptIfNeeded(rawBody: string, ivHeader: string | null): string {
  let body: { data?: unknown };
  try {
    body = JSON.parse(rawBody) as { data?: unknown };
  } catch {
    return rawBody;
  }
  if (typeof body.data !== "string") return rawBody;

  if (!ivHeader) {
    console.error("[eupago] corpo encriptado sem X-Initialization-Vector.");
    return rawBody;
  }

  try {
    const key = Buffer.from(requireEnv("EUPAGO_WEBHOOK_SECRET"));
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(ivHeader, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(body.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    console.error("[eupago] falha a desencriptar o webhook:", error);
    return rawBody;
  }
}

function equalsSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook 1.0: a única credencial é a `chave_api` devolvida na query string.
 * É um gate barato para cortar ruído — **não** é autenticação: a chave viaja
 * no URL, ou seja, fica escrita nos logs da Vercel e de tudo por onde passa.
 * Por isso é que `confirmPaid` existe.
 */
export function verifyWebhook1Key(chaveApi: string | null): boolean {
  if (!chaveApi) return false;
  return equalsSecret(chaveApi, requireEnv("EUPAGO_API_KEY"));
}

/** Lê a notificação 1.0 da query string. Só dispara em pagamento confirmado. */
export function parseWebhook1(params: URLSearchParams): PaymentNotification | null {
  const identifier = params.get("identificador");
  if (!identifier) return null;

  // `valor` vem em euros com ponto decimal ("2.00"). Passa por cêntimos via
  // arredondamento para não herdar o erro da vírgula flutuante.
  const valor = Number.parseFloat(params.get("valor") ?? "");
  return {
    identifier,
    reference: params.get("referencia") ?? "",
    status: "Paid",
    amountCents: Number.isFinite(valor) ? Math.round(valor * 100) : null,
  };
}

/**
 * Lê a notificação 2.0 do corpo JSON.
 *
 * A transação vem **dentro de `transactions`**, não na raiz — ler na raiz
 * devolvia `identifier: undefined` e o webhook respondia 200 sem ativar nada,
 * em silêncio. Aceitamos também a forma achatada por segurança, caso a Eupago
 * a envie assim nalgum evento.
 */
export function parseWebhook2(
  rawBody: string,
  ivHeader: string | null = null,
): PaymentNotification | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(decryptIfNeeded(rawBody, ivHeader)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const tx = (body.transactions ?? body) as {
    identifier?: string;
    reference?: string | number;
    status?: string;
    amount?: { value?: number };
  };
  if (!tx.identifier || !tx.status) return null;

  const value = tx.amount?.value;
  return {
    identifier: tx.identifier,
    reference: String(tx.reference ?? ""),
    status: tx.status as PaymentStatus,
    amountCents: typeof value === "number" ? Math.round(value * 100) : null,
  };
}

/**
 * Pergunta à Eupago se a referência está mesmo paga, antes de dar acesso.
 *
 * É isto que torna o 1.0 utilizável: uma notificação forjada não sobrevive a
 * uma pergunta feita ao servidor da Eupago com a nossa chave. Falha fechada em
 * produção — se não conseguimos confirmar, não emitimos nada. Em sandbox
 * deixa passar com aviso, senão era impossível testar antes de o suporte da
 * Eupago responder.
 *
 * ATENÇÃO: a forma exata do pedido/resposta deste endpoint tem de ser validada
 * no primeiro pagamento real em sandbox — está documentada como "Reference
 * Information" mas sem exemplo de corpo. Se falhar, os logs dizem-no.
 */
export async function confirmPaid(reference: string): Promise<boolean> {
  const isProduction = process.env.EUPAGO_ENV === "production";
  if (!reference) {
    console.warn("[eupago] notificação sem referência — não dá para confirmar.");
    return !isProduction;
  }

  try {
    const res = await fetch(`${baseUrl()}/api/v1/reference-information`, {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${requireEnv("EUPAGO_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reference }),
    });

    if (!res.ok) {
      console.error(`[eupago] confirmação falhou: ${res.status} ${await res.text()}`);
      return !isProduction;
    }

    const data = (await res.json()) as { transactionStatus?: string; status?: string };
    const estado = (data.transactionStatus ?? data.status ?? "").toLowerCase();
    if (estado.includes("paid") || estado.includes("pago")) return true;

    console.warn(`[eupago] referência ${reference} não está paga (estado: "${estado}").`);
    return false;
  } catch (error) {
    console.error("[eupago] confirmação inacessível:", error);
    return !isProduction;
  }
}
