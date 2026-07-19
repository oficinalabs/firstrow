import { NextResponse } from "next/server";
import { z } from "zod";
import { createSplitMbwayPayment } from "@/lib/eupago";
import { limitByIp } from "@/lib/rate-limit";
import { buildSplit } from "@/lib/split";
import { requireApi } from "@/server/api-guard";
import { getEvent } from "@/server/events";
import { createPendingTicket } from "@/server/tickets";

const bodySchema = z.object({ phone: z.string().trim().min(9) });

// Compra de bilhete físico por MB WAY — espelha o checkout de acesso à live,
// mas o `identifier` na Eupago é o id do bilhete ("tkt_…"), que o webhook emite.
// O bilhete é sempre criado para o dono da sessão.
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  const limited = limitByIp(req, "checkout", gate.user.id);
  if (limited) return limited;

  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Confirma o telemóvel — faltam dígitos." }, { status: 400 });
  }

  const result = await createPendingTicket(gate.user.id, eventId);
  if (!result.ok) {
    const error =
      result.reason === "esgotado"
        ? "Os bilhetes esgotaram."
        : "Este evento não tem bilhetes à venda.";
    return NextResponse.json({ error }, { status: 409 });
  }

  const amountEur = result.ticket.priceCents / 100;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  await createSplitMbwayPayment({
    amountEur,
    phone: parsed.data.phone,
    identifier: result.ticket.id,
    beneficiaries: buildSplit(amountEur),
    callbackUrl: `${appUrl}/api/webhooks/eupago`,
  });

  // Só o id do bilhete — a resposta crua da Eupago fica no servidor.
  // O `ticketId` é o que o cliente usa para fazer polling do estado.
  return NextResponse.json({ ok: true, ticketId: result.ticket.id });
}
