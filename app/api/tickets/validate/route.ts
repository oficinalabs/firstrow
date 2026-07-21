import { NextResponse } from "next/server";
import { z } from "zod";
import { limitByAccountShared } from "@/lib/rate-limit";
import { requireApi, requireApiForEvent } from "@/server/api-guard";
import { canOperateEvents } from "@/server/authz";
import { validateTicket } from "@/server/tickets";

const bodySchema = z.object({
  code: z.string().trim().min(4),
  eventId: z.string().min(1),
});

/*
 * A PORTA DO EVENTO. Quem chega aqui pergunta "este bilhete é válido?" — e a
 * resposta vale dinheiro.
 *
 * `canOperateEvents` e não `canManageEvents`: a equipa da liga valida à porta
 * sem precisar de poder mexer no evento nem nas contas. E `canOperateEvents`
 * NO CANAL do evento que vem no corpo — senão, quem trabalha à porta de uma
 * liga podia marcar bilhetes como usados nos eventos de outra.
 *
 * A ordem é de propósito: sessão (401) → limite → corpo → portão do evento. O
 * limite tem de vir antes da ida à base de dados, senão um scanner encravado
 * fazia-nos pagar as queries todas antes de o travarmos.
 *
 * O limite é por OPERADOR e o IP NÃO entra na chave: numa porta com fila, o
 * staff sai todo pelo mesmo router, e um balde por IP bloqueava a equipa
 * inteira quando um telemóvel encravasse a repetir pedidos. Por conta, trava o
 * scanner em loop sem parar a porta. (Até esta frente a chave era `IP|conta`,
 * que dava o resultado certo à porta mas deixava o mesmo operador recomeçar a
 * contagem só por saltar de wifi para dados móveis.)
 *
 * E é o contador PARTILHADO: o de memória não trava nada em serverless, e um
 * scanner encravado é precisamente o caso em que os pedidos se espalham por
 * várias instâncias.
 */
export async function POST(req: Request) {
  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  const limited = await limitByAccountShared("ticketValidate", gate.user.id);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Código em falta" }, { status: 400 });
  }

  const eventGate = await requireApiForEvent(parsed.data.eventId, canOperateEvents);
  if (!eventGate.ok) return eventGate.response;

  // O canal segue para a validação: é ele que limita o que a resposta pode
  // contar sobre um bilhete que não é deste evento — ver server/tickets.ts.
  const result = await validateTicket(
    parsed.data.code,
    eventGate.event.id,
    eventGate.event.channelId,
  );
  return NextResponse.json(result);
}
