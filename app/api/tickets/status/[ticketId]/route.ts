import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-helper";
import { getTicketStatus } from "@/server/tickets";

// Poll do comprador enquanto espera a confirmação MB WAY (só vê os próprios).
export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const status = await getTicketStatus(ticketId, user.id);
  if (!status) return NextResponse.json({ error: "Bilhete não encontrado" }, { status: 404 });

  return NextResponse.json({ status });
}
