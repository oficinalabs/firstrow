import { NextResponse } from "next/server";
import { createMbwayCharge } from "@/lib/eupago";
import { limitByIp } from "@/lib/rate-limit";
import { buildSplit } from "@/lib/split";
import { requireApi } from "@/server/api-guard";
import { createPendingEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";
import { recordChargeReference } from "@/server/purchases";

/*
 * Compra do acesso à live. Autorização = ter sessão; o dono do recurso é
 * sempre `gate.user.id` — nunca um id vindo do corpo do pedido.
 *
 * Limite: cada chamada cria uma referência MB WAY na Eupago e faz o telemóvel
 * de alguém tocar. Sem travão, isto era um botão de spam para push notifications.
 */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  const limited = limitByIp(req, "checkout", gate.user.id);
  if (limited) return limited;

  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { phone?: string } | null;
  if (!body?.phone) return NextResponse.json({ error: "Telemóvel em falta" }, { status: 400 });

  // Cria o entitlement pendente; o id serve de `identifier` na Eupago para o webhook o ativar.
  const entitlement = await createPendingEntitlement(gate.user.id, eventId);
  const amountEur = event.priceCents / 100;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const charge = await createMbwayCharge({
    amountEur,
    phone: body.phone,
    identifier: entitlement.id,
    beneficiaries: buildSplit(amountEur),
    callbackUrl: `${appUrl}/api/webhooks/eupago`,
  });

  // Guardar a referência agora, e não só quando o webhook chegar: é o que
  // permite reconciliar uma compra cujo webhook se perca pelo caminho.
  await recordChargeReference("entitlement", entitlement.id, charge.reference);

  // A resposta crua da Eupago NÃO sai daqui: traz referências e identificadores
  // do nosso contrato que o browser não precisa de ver. O cliente só quer
  // saber que o pedido entrou — o resto confirma-se pelo polling.
  return NextResponse.json({ ok: true });
}
