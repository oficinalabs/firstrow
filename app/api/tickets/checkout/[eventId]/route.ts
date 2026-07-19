import { NextResponse } from "next/server";
import { z } from "zod";
import { createMbwayCharge } from "@/lib/eupago";
import { validarConsentimento } from "@/lib/legal/consentimentos";
import { limitByIp } from "@/lib/rate-limit";
import { buildSplit } from "@/lib/split";
import { requireApi } from "@/server/api-guard";
import { guardarConsentimento } from "@/server/consents";
import { getEvent } from "@/server/events";
import { hasLiveCharge, recordChargeReference } from "@/server/purchases";
import { createPendingTicket } from "@/server/tickets";

/*
 * O bilhete leva a versão do texto de consentimento que o cliente viu. Não há
 * checkbox (é a opção A, informativa) — mas guarda-se na mesma o texto exato
 * mostrado, para a prova. `consentAceite` fica de fora: não existe aceitação a
 * validar num consentimento sem checkbox.
 */
const bodySchema = z.object({
  phone: z.string().trim().min(9),
  consentVersao: z.string().min(1),
});

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

  /*
   * Consentimento do bilhete: sempre `bilhete` (evento presencial com data
   * marcada). Valida-se a versão — se o cliente não a mandou, ou é de antes de
   * um deploy que mudou a redação, recusa-se aqui e não se cobra. Não há
   * checkbox a exigir, mas o texto exato mostrado fica guardado.
   */
  const consent = validarConsentimento({
    kind: "bilhete",
    versao: parsed.data.consentVersao,
    aceite: undefined,
  });
  if (!consent.ok) return NextResponse.json({ error: consent.erro }, { status: 400 });

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

  // Dois cliques não podem virar dois pedidos ao telemóvel da pessoa: ela podia
  // aceitar os dois e pagar dois bilhetes julgando comprar um. O bilhete
  // pendente é reutilizado, a cobrança não.
  if (await hasLiveCharge("ticket", result.ticket.id)) {
    return NextResponse.json(
      { error: "Já enviámos um pedido para o teu telemóvel. Confirma na app MB WAY." },
      { status: 409 },
    );
  }

  // A prova antes da cobrança — o erro passa de propósito (ver a rota de PPV).
  await guardarConsentimento({
    compra: { tipo: "ticket", id: result.ticket.id },
    userId: gate.user.id,
    userEmail: gate.user.email,
    eventId,
    eventTitle: event.title,
    kind: "bilhete",
    texto: consent.texto,
    versao: consent.versao,
    checkboxAceite: consent.checkboxAceite,
    req,
  });

  const charge = await createMbwayCharge({
    amountEur,
    phone: parsed.data.phone,
    identifier: result.ticket.id,
    beneficiaries: buildSplit(amountEur),
    callbackUrl: `${appUrl}/api/webhooks/eupago`,
  });

  // Guardar a referência agora, e não só quando o webhook chegar: é o que
  // permite reconciliar uma compra cujo webhook se perca pelo caminho.
  await recordChargeReference("ticket", result.ticket.id, charge.reference);

  // Só o id do bilhete — a resposta crua da Eupago fica no servidor.
  // O `ticketId` é o que o cliente usa para fazer polling do estado.
  return NextResponse.json({ ok: true, ticketId: result.ticket.id });
}
