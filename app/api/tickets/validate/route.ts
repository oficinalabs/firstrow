import { NextResponse } from "next/server";
import { z } from "zod";
import { limitByIp } from "@/lib/rate-limit";
import { requireApi } from "@/server/api-guard";
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
 * sem precisar de poder mexer no evento nem nas contas.
 *
 * O limite é por OPERADOR e não só por IP: numa porta com fila, o staff sai
 * todo pelo mesmo router, e um balde partilhado bloqueava a equipa inteira
 * quando um telemóvel encravasse a repetir pedidos. Por conta, trava o
 * scanner em loop sem parar a porta.
 */
export async function POST(req: Request) {
  const gate = await requireApi(canOperateEvents);
  if (!gate.ok) return gate.response;

  const limited = limitByIp(req, "ticketValidate", gate.user.id);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Código em falta" }, { status: 400 });
  }

  const result = await validateTicket(parsed.data.code, parsed.data.eventId);
  return NextResponse.json(result);
}
