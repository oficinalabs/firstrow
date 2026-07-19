import { NextResponse } from "next/server";
import { validateEventForm } from "@/lib/event-rules";
import { requireApi } from "@/server/api-guard";
import { resolveChannelForNewEvent } from "@/server/event-access";
import { createEvent } from "@/server/events";

/*
 * Criar evento por JSON.
 *
 * O backoffice usa a server action (app/admin/eventos/actions.ts); esta rota é
 * a mesma operação para quem chame de fora, e passa pelas MESMAS regras
 * (lib/event-rules.ts) e pela mesma guarda de duplicados (server/events.ts) —
 * não há uma porta com validação mais fraca do que a outra.
 *
 * Criar eventos é gerir a liga (e o dinheiro dela) → tem de ser num canal onde
 * quem pede seja dono. É `resolveChannelForNewEvent` que o decide, e que
 * RECUSA em vez de adivinhar quando há mais do que uma hipótese: criar o evento
 * na liga errada é pôr o dinheiro a cair no sítio errado.
 *
 * Corpo: { title, date: "2026-07-26", time: "21:00", price: "7,50", canal? }.
 * A hora é de Lisboa, como no formulário. `canal` é o slug do canal e só é
 * obrigatório para quem gere mais do que um.
 *
 * PORQUE É QUE A RECUSA DO CANAL TEM DOIS STATUS
 * Não dizer qual dos teus canais é um pedido incompleto (**400**) — o cliente
 * corrige-o sozinho acrescentando `canal`. Pedir um canal que não existe ou que
 * não é dele é uma recusa de permissão (**403**), e as duas dão a MESMA
 * mensagem de propósito: se o "não existe" fosse distinguível do "não é teu",
 * bastava varrer slugs para ficar a saber que ligas há na plataforma.
 *
 * 403 e não 404 (ao contrário dos eventos): o slug de um canal é público — está
 * no URL de /canal/[slug] — por isso recusar não conta nada que já não se saiba.
 *
 * A resposta devolve só o id: as credenciais RTMPS (a chave da stream incluída)
 * vão-se buscar à página de transmissão, por quem tem papel para as ver.
 */
export async function POST(req: Request) {
  // Só sessão: a autorização a sério é por canal, e o canal só se sabe depois
  // de ler o corpo do pedido.
  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido — esperava JSON." }, { status: 400 });
  }

  const requested = (body as { canal?: unknown })?.canal;
  const slug = typeof requested === "string" ? requested.trim() : "";
  const channel = await resolveChannelForNewEvent(gate.user, slug || undefined);
  if (!channel.ok) {
    return NextResponse.json(
      { error: channel.error, campo: "canal" },
      { status: channel.reason === "ambiguous" ? 400 : 403 },
    );
  }

  const checked = validateEventForm(body);
  if (!checked.ok) {
    return NextResponse.json({ error: "Dados inválidos", campos: checked.errors }, { status: 400 });
  }

  try {
    const created = await createEvent(checked.draft, channel.channelId);
    return NextResponse.json({ id: created.id }, { status: created.reused ? 200 : 201 });
  } catch (error) {
    console.error("[api/admin/events] criar falhou:", error);
    return NextResponse.json({ error: "Não deu para criar o evento." }, { status: 502 });
  }
}
