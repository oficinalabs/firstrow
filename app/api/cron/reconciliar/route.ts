import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcilePending } from "@/server/reconcile";

/*
 * ============================================================================
 *  CRON — a rede por baixo de quem pagou e fechou o separador
 * ============================================================================
 *
 * Corre de 5 em 5 minutos (`vercel.json`) e pergunta à Eupago se as compras
 * pendentes já foram pagas. O caminho rápido é outro — quem está no ecrã de
 * compra é reconciliado no próprio polling, em segundos (ver
 * `server/reconcile.ts`). Isto é para quem já lá não está.
 *
 * PORQUÊ 5 MINUTOS: a janela em que uma compra pode ser paga é a do pedido MB
 * WAY, ~5 minutos. Com este período, uma compra perdida é apanhada ainda dentro
 * da noite do evento e no máximo cinco minutos depois de deixar de haver alguém
 * a fazer polling por ela. Mais curto não ganhava nada (a janela útil não
 * encolhe); mais longo deixava um cliente sem acesso durante o evento que
 * pagou.
 *
 * ⚠️  **A Vercel só permite crons de menos de um dia a partir do plano Pro.**
 * Num plano Hobby, o deploy recusa este `vercel.json` — nesse caso o período
 * tem de passar a diário (`0 4 * * *`) e o caminho de quem está à espera fica a
 * carregar sozinho o caso do dia a dia, com o cron a servir só de rede final.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  A AUTENTICAÇÃO, E PORQUE É QUE ELA FECHA MESMO SEM SEGREDO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A Vercel envia `Authorization: Bearer $CRON_SECRET` nos pedidos de cron
 * quando essa variável existe no projeto. Sem ela definida, **isto recusa
 * tudo** em vez de abrir: um endpoint aberto não daria acesso a quem não pagou
 * (`confirmPaid` continua a decidir isso), mas era um amplificador — qualquer
 * pessoa forçava dezenas de chamadas nossas à Eupago a cada pedido.
 *
 * A comparação é em tempo constante, como a do webhook. E a resposta a um
 * segredo errado não diz se a variável existe: é sempre o mesmo 401.
 */

export const dynamic = "force-dynamic";
/** 40 verificações em grupos de 5, a ~300 ms cada, cabem à vontade. */
export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;

  const recebido = req.headers.get("authorization") ?? "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // `{ all: true }` e não um âmbito de utilizador: aqui não há sessão nenhuma,
  // e o trabalho é de toda a plataforma. É o único sítio onde isto é legítimo.
  const relatorio = await reconcilePending({ all: true });

  // Só se regista quando houve mesmo trabalho — um cron a escrever de 5 em 5
  // minutos "nada a fazer" enterra o log em que a linha útil vai aparecer.
  if (relatorio.candidatas > 0) {
    console.info("[reconciliação] cron:", relatorio);
  }

  return NextResponse.json(relatorio);
}
