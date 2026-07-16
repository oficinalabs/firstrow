import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/server-env";

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

export async function createSplitMbwayPayment(input: CreateSplitMbwayInput): Promise<unknown> {
  const apiKey = requireEnv("EUPAGO_API_KEY");

  const res = await fetch(`${baseUrl()}/api/v1/split-payments/mbway`, {
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
      beneficiaries: input.beneficiaries,
    }),
  });

  if (!res.ok) {
    throw new Error(`Eupago MB WAY falhou: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Verifica o header X-Signature: HMAC-SHA256 do corpo cru, em base64.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = requireEnv("EUPAGO_WEBHOOK_SECRET");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type EupagoWebhookPayload = {
  identifier?: string;
  reference?: number;
  amount?: { value?: number; currency?: string };
  status?: "Paid" | "Refund" | "Error" | "Cancel" | "Expired";
  method?: string;
  date?: string;
};
