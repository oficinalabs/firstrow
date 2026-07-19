import { NextResponse } from "next/server";
import { requireApi } from "@/server/api-guard";
import { getTicketStatus } from "@/server/tickets";

/*
 * Poll do comprador enquanto espera a confirmação MB WAY.
 *
 * `getTicketStatus(ticketId, userId)` filtra por dono na própria query — um
 * bilhete de outra pessoa não devolve 403 (que confirmaria que existe), devolve
 * o mesmo 404 de um bilhete inventado. Enumerar ids não dá informação nenhuma.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;

  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  const status = await getTicketStatus(ticketId, gate.user.id);
  if (!status) return NextResponse.json({ error: "Bilhete não encontrado" }, { status: 404 });

  return NextResponse.json({ status });
}
