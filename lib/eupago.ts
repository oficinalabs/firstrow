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
 * Normaliza o telemóvel para os dois formatos que a Eupago pede — porque pede
 * formatos diferentes em endpoints diferentes.
 *
 * Aceita o que a pessoa escrever: "912345678", "+351 912 345 678",
 * "351#912345678". Assume Portugal quando não vem indicativo, que é o único
 * mercado da plataforma; no dia em que deixar de ser, isto tem de mudar.
 *
 * O `customerPhone` leva o número **sem indicativo** — o indicativo vai no
 * `countryCode`, à parte. Isto foi medido contra o sandbox, não lido: o exemplo
 * da documentação mostra `"+351912345678"` nesse campo e a API **rejeita-o**
 * com CUSTOMERPHONE_INVALID. Só o número local passa.
 */
function normalizePhone(raw: string): { alias: string; customerPhone: string; country: string } {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("351") ? digits.slice(3) : digits;
  return {
    // O split usa outro formato ainda: indicativo, cardinal, número.
    alias: `351#${local}`,
    customerPhone: local,
    country: "+351",
  };
}

/**
 * Cobra por MB WAY, com split quando ele está configurado.
 *
 * São **duas APIs diferentes**, e não variações da mesma:
 *  · split  → `/api/v1/split-payments/mbway`, corpo achatado, `alias` com o
 *    telemóvel e `adminCallback` no próprio pedido.
 *  · simples → `/api/v1.02/mbway/create`, corpo aninhado em `payment`/`customer`
 *    e **sem callback nenhum** — a notificação sai do webhook configurado no
 *    canal, no backoffice.
 *
 * O split precisa de uma `externKey` por beneficiário, criada no backoffice.
 * Enquanto essas chaves não existirem, o comportamento diverge por ambiente, de
 * propósito:
 *
 *  · **produção** — recusa. Cobrar sem split fazia o dinheiro TODO entrar na
 *    conta da FirstRow, incluindo a parte da liga, e transformava um problema
 *    de configuração numa dívida a um cliente. Falhar a compra é menos mau.
 *  · **sandbox** — cobra por MB WAY simples e avisa no log. Não há dinheiro
 *    real, e sem isto era impossível testar o resto da cadeia.
 */
export type MbwayCharge = {
  /** Referência curta da Eupago — a mesma que o webhook devolve depois. */
  reference: string | null;
  transactionId: string | null;
};

export async function createMbwayCharge(input: CreateSplitMbwayInput): Promise<MbwayCharge> {
  const apiKey = requireEnv("EUPAGO_API_KEY");
  const isProduction = process.env.EUPAGO_ENV === "production";
  const phone = normalizePhone(input.phone);

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

  const { path, body } = comSplit
    ? {
        path: "/api/v1/split-payments/mbway",
        body: {
          amount: input.amountEur,
          alias: phone.alias,
          identifier: input.identifier,
          adminCallback: input.callbackUrl,
          lang: "PT",
          beneficiaries: input.beneficiaries,
        },
      }
    : {
        path: "/api/v1.02/mbway/create",
        body: {
          payment: {
            identifier: input.identifier,
            amount: { value: input.amountEur, currency: "EUR" },
            customerPhone: phone.customerPhone,
            countryCode: phone.country,
          },
          customer: { notify: true },
        },
      };

  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { Authorization: `ApiKey ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // O corpo da resposta da Eupago vai no erro de propósito: é a única pista
    // sobre o que está errado no pedido, e não traz dados do comprador.
    throw new Error(`Eupago MB WAY falhou (${path}): ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { reference?: string | number; transactionID?: string };
  return {
    reference: data.reference != null ? String(data.reference) : null,
    transactionId: data.transactionID ?? null,
  };
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
 * produção — se não conseguimos confirmar, não emitimos nada. Em sandbox deixa
 * passar com aviso, senão era impossível testar antes de a Eupago responder.
 *
 * TRÊS ARMADILHAS, todas medidas contra o sandbox e nenhuma óbvia a ler a doc:
 *
 *  1. **Outro host de API.** Não é `/api/v1*` como o resto da integração; é o
 *     REST antigo em `/clientes/rest_api/multibanco/info`. O caminho por
 *     analogia dava 404.
 *  2. **Outra autenticação.** A chave vai no CORPO (`chave`), não no header
 *     `Authorization` que todos os outros endpoints usam.
 *  3. **`estado` não é o estado do pagamento** — é um código numérico onde 0
 *     significa "pedido correu bem". O estado do pagamento está em
 *     `estado_referencia`, e o valor é **"paga"**. Repara que não é "pago":
 *     procurar por "pago" nunca corresponderia, e um `includes` desatento
 *     dava sempre não-pago sem ninguém perceber porquê.
 *
 * O endpoint chama-se "multibanco" mas responde por referências MB WAY — foi
 * verificado com uma referência MB WAY real.
 */
export async function confirmPaid(reference: string): Promise<boolean> {
  const isProduction = process.env.EUPAGO_ENV === "production";
  if (!reference) {
    console.warn("[eupago] notificação sem referência — não dá para confirmar.");
    return !isProduction;
  }

  try {
    const res = await fetch(`${baseUrl()}/clientes/rest_api/multibanco/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave: requireEnv("EUPAGO_API_KEY"), referencia: reference }),
    });

    if (!res.ok) {
      console.error(`[eupago] confirmação falhou: ${res.status} ${await res.text()}`);
      return !isProduction;
    }

    const data = (await res.json()) as {
      estado_referencia?: string;
      pagamentos?: { estado?: string }[];
      sucesso?: boolean;
    };

    // A lista de pagamentos é a corroboração: uma referência paga traz lá a
    // linha do pagamento. Aceitar qualquer uma das duas evita ficar refém de
    // uma renomeação de campo do lado deles.
    const estado = (data.estado_referencia ?? "").toLowerCase();
    const temPagamento = (data.pagamentos ?? []).some((p) => p.estado?.toLowerCase() === "paga");
    if (estado === "paga" || temPagamento) return true;

    console.warn(`[eupago] referência ${reference} não está paga (estado: "${estado}").`);
    return false;
  } catch (error) {
    console.error("[eupago] confirmação inacessível:", error);
    return !isProduction;
  }
}
