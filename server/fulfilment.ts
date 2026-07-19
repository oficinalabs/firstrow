import "server-only";
import { sendReceiptEmail } from "@/lib/email";
import { confirmPaid } from "@/lib/eupago";
import { activateEntitlement } from "@/server/entitlements";
import { issueTicket, isTicketId } from "@/server/tickets";

/*
 * ============================================================================
 *  DE "PAGARAM" A "TEM ACESSO" — o caminho único
 * ============================================================================
 *
 * Há duas maneiras de sabermos que uma compra foi paga:
 *
 *   · o webhook da Eupago (`app/api/webhooks/eupago`), quando chega;
 *   · a reconciliação (`server/reconcile.ts`), quando ele não chega.
 *
 * O que acontece a seguir tem de ser **exatamente o mesmo código** nos dois
 * casos, e é por isso que vive aqui. Um segundo caminho que fizesse "quase" o
 * mesmo — activar sem confirmar, activar sem recibo, activar sem a guarda de
 * repetição — passava despercebido no primeiro mês e divergia no terceiro, com
 * um cliente a receber dois recibos ou nenhum, e ninguém a saber porquê.
 *
 * TRÊS REGRAS QUE ESTA FUNÇÃO CARREGA, E NENHUMA É OPCIONAL
 *
 *  1. **Quem confirma o pagamento é a Eupago, não quem nos avisa.** O webhook
 *     1.0 não é assinado e o 2.0 pode ser repetido; nenhuma notificação é prova.
 *     `confirmPaid` pergunta ao servidor deles com a nossa chave. A
 *     reconciliação passa pela mesma pergunta — não é que ela "já saiba".
 *  2. **A transição de estado é a fechadura da idempotência.** `pending →
 *     active` (ou `pending → issued`) é um UPDATE condicional que devolve linha
 *     só à primeira. Quem não apanhar a linha não envia recibo.
 *  3. **O recibo sai da transição, não da confirmação.** É o que garante um
 *     email por compra mesmo com o webhook e a reconciliação a chegarem ao
 *     mesmo tempo: só um deles apanha a linha.
 */

/** Que tipo de compra é — o prefixo do `identifier` é que decide. */
export type PurchaseKind = "entitlement" | "ticket";

export function purchaseKindOf(identifier: string): PurchaseKind {
  return isTicketId(identifier) ? "ticket" : "entitlement";
}

/**
 * O que aconteceu a uma tentativa de fechar uma compra.
 *
 * `sem-efeito` junta de propósito "já estava ativa" e "esse identificador não é
 * de nada nosso": a transição condicional não os distingue, e distingui-los
 * obrigava a uma segunda query para nada — em ambos os casos não há nada a
 * fazer nem recibo a enviar.
 */
export type SettleResult = "ativada" | "sem-efeito" | "por-pagar";

/**
 * Confirma com a Eupago e, se estiver paga, dá o acesso e envia o recibo.
 *
 * Devolve `por-pagar` sem tocar em nada quando a Eupago diz que a referência
 * ainda não foi paga — é o caso normal de uma compra a decorrer, e não um erro.
 */
export async function settlePurchase(identifier: string, reference: string): Promise<SettleResult> {
  if (!(await confirmPaid(reference))) return "por-pagar";
  return grantAndNotify(identifier, reference);
}

/**
 * A parte de baixo, já com o pagamento confirmado: transitar o estado e enviar
 * o recibo da primeira (e só da primeira) vez.
 *
 * Separada de `settlePurchase` porque o webhook 1.0 e o 2.0 já chamaram
 * `confirmPaid` com o seu próprio tratamento de erro; a reconciliação usa a de
 * cima. A ORDEM e o CONTEÚDO do que se faz aqui é o que não pode divergir.
 */
export async function grantAndNotify(identifier: string, reference: string): Promise<SettleResult> {
  const receipt =
    purchaseKindOf(identifier) === "ticket"
      ? await issueTicket(identifier, reference)
      : await activateEntitlement(identifier, reference);
  if (!receipt) return "sem-efeito";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  await sendReceiptEmail({
    nome: receipt.nome ?? undefined,
    eventoTitulo: receipt.eventoTitulo,
    // O canal vem do evento pago (server/receipts.ts), não de uma constante:
    // o recibo tem de nomear a liga a quem se pagou.
    canalNome: receipt.canalNome,
    eventoData: receipt.eventoData,
    valorCents: receipt.valorCents,
    numeroRecibo: reference || undefined,
    emailConta: receipt.emailConta,
    urlEvento: `${appUrl}/eventos/${receipt.eventId}`,
  });

  return "ativada";
}
