import { NextResponse } from "next/server";
import { createMbwayCharge } from "@/lib/eupago";
import { tipoDeConsentimentoDoEvento, validarConsentimento } from "@/lib/legal/consentimentos";
import { limitByIp } from "@/lib/rate-limit";
import { buildSplit } from "@/lib/split";
import { requireApi } from "@/server/api-guard";
import { guardarConsentimento } from "@/server/consents";
import { createPendingEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";
import { hasLiveCharge, recordChargeReference } from "@/server/purchases";

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

  const body = (await req.json().catch(() => null)) as {
    phone?: string;
    consentVersao?: unknown;
    consentAceite?: unknown;
  } | null;
  if (!body?.phone) return NextResponse.json({ error: "Telemóvel em falta" }, { status: 400 });

  /*
   * PROVA DE CONSENTIMENTO — antes de qualquer cobrança.
   *
   * O `kind` sai do estado do evento, no servidor: o cliente não escolhe se é
   * PPV ou VOD nem que texto aceitou. Uma compra de arquivo sem a renúncia
   * marcada é recusada aqui, com 400, antes de o telemóvel de alguém tocar — é
   * esta a guarda que o botão desativado no browser só imita.
   */
  const kind = tipoDeConsentimentoDoEvento(event.status);
  const consent = validarConsentimento({
    kind,
    versao: body.consentVersao,
    aceite: body.consentAceite,
  });
  if (!consent.ok) return NextResponse.json({ error: consent.erro }, { status: 400 });

  // Cria o entitlement pendente; o id serve de `identifier` na Eupago para o webhook o ativar.
  const entitlement = await createPendingEntitlement(gate.user.id, eventId);
  const amountEur = event.priceCents / 100;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Dois cliques não podem virar dois pedidos ao telemóvel da pessoa: ela podia
  // aceitar os dois e pagar duas vezes o mesmo acesso. A compra é reutilizada,
  // a cobrança não. Passada a janela, o pedido anterior expirou e pode repetir.
  if (await hasLiveCharge("entitlement", entitlement.id)) {
    return NextResponse.json(
      { error: "Já enviámos um pedido para o teu telemóvel. Confirma na app MB WAY." },
      { status: 409 },
    );
  }

  /*
   * Guardar a prova exatamente antes da cobrança, e deixar o erro passar (ao
   * contrário de `recordChargeReference`, que o engole): se não conseguimos
   * registar o que a pessoa aceitou, é preferível a compra falhar sem cobrança
   * do que cobrar sem prova. O texto vem do servidor (`consent.texto`), nunca
   * do corpo do pedido.
   */
  await guardarConsentimento({
    compra: { tipo: "entitlement", id: entitlement.id },
    userId: gate.user.id,
    userEmail: gate.user.email,
    eventId,
    eventTitle: event.title,
    kind,
    texto: consent.texto,
    versao: consent.versao,
    checkboxAceite: consent.checkboxAceite,
    req,
  });

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
