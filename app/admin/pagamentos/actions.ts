"use server";

import { revalidatePath } from "next/cache";
import { canManageAnyChannel, getCurrentUser, manageScope } from "@/server/authz";
import { type ReconcileReport, reconcilePending } from "@/server/reconcile";

export type VerificacaoResult = { relatorio: ReconcileReport } | { error: string };

/*
 * "Verificar agora" — pergunta à Eupago pelas compras pendentes DESTA pessoa.
 *
 * O cron já faz isto de 5 em 5 minutos; este botão existe para quem está ao
 * telefone com um cliente e não quer esperar. É a mesma função, o mesmo
 * `confirmPaid` e a mesma ativação idempotente — não há um caminho "manual".
 *
 * GATE PRÓPRIO, E O ÂMBITO VEM DA SESSÃO
 *
 * Uma server action é um endpoint: não herda o gate do layout (que, aliás,
 * renderiza em paralelo com a página — ver `app/admin/layout.tsx`). E o âmbito
 * NÃO pode vir do cliente: `manageScope(user)` é lido aqui, do lado do
 * servidor, a cada chamada. Sem isso, o dono do canal A carregava no botão e
 * disparava — e via o resultado de — verificações do canal B.
 *
 * Não leva limite de pedidos próprio e não é esquecimento: o travão está na
 * base de dados (`reconciled_at`), que dá no máximo uma pergunta à Eupago por
 * compra a cada 30 s por muito que se carregue no botão. Um contador em memória
 * como o de `lib/rate-limit.ts` não sobreviveria ao serverless; este sobrevive.
 */
export async function verificarPagamentos(): Promise<VerificacaoResult> {
  const user = await getCurrentUser();
  /*
   * `canManageAnyChannel` e não `canEnterBackoffice`, e a diferença é o ponto
   * todo: `canEnterBackoffice` alargou para deixar o staff chegar ao scanner.
   * Se esta linha tivesse ficado presa ao nome antigo, alargar a PORTA do
   * backoffice punha quem valida bilhetes a disparar reconciliações de
   * pagamentos. O gate desta action é dinheiro, logo é `owner`.
   */
  if (!user || !canManageAnyChannel(user)) {
    return { error: "Não tens permissão para isto." };
  }

  const relatorio = await reconcilePending(manageScope(user));
  revalidatePath("/admin/pagamentos");
  // Uma compra fechada muda a receita e os pagamentos recentes do dashboard.
  if (relatorio.ativadas > 0) revalidatePath("/admin");

  return { relatorio };
}
