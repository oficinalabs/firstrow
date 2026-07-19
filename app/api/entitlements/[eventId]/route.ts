import { NextResponse } from "next/server";
import { requireApi } from "@/server/api-guard";
import { hasActiveEntitlement, pendingEntitlementId } from "@/server/entitlements";
import { reconcilePurchase } from "@/server/reconcile";

/*
 * Usado pelo botão de compra para fazer polling até o pagamento confirmar.
 * Responde sempre sobre o utilizador da sessão — não aceita `userId` de fora.
 *
 * ANTES DE RESPONDER, VAI VER SE O WEBHOOK SE PERDEU
 *
 * Este é o momento em que o cliente sabe que pagou e nós ainda não: ele está no
 * ecrã, à espera. Se a notificação da Eupago se perdeu — e já se perdeu —, é
 * aqui que se dá por isso, em segundos, em vez de na próxima passagem do cron.
 *
 * Não custa o que parece: só há o que reconciliar enquanto existir uma compra
 * pendente com cobrança pedida, e `reconcilePurchase` tem o seu próprio travão
 * na base de dados (uma pergunta à Eupago por compra a cada 30 s, no máximo).
 * Quando o webhook chega primeiro — o caso normal — não sobra compra pendente
 * nenhuma e isto é uma query indexada e mais nada.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  const pendente = await pendingEntitlementId(gate.user.id, eventId);
  if (pendente) await reconcilePurchase("entitlement", pendente);

  return NextResponse.json({ active: await hasActiveEntitlement(gate.user.id, eventId) });
}
