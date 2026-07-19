import { NextResponse } from "next/server";
import { validateEventForm } from "@/lib/event-rules";
import { requireApi } from "@/server/api-guard";
import { canManageEvents } from "@/server/authz";
import { createEvent } from "@/server/events";

/*
 * Criar evento por JSON.
 *
 * O backoffice usa a server action (app/admin/eventos/actions.ts); esta rota é
 * a mesma operação para quem chame de fora, e passa pelas MESMAS regras
 * (lib/event-rules.ts) e pela mesma guarda de duplicados (server/events.ts) —
 * não há uma porta com validação mais fraca do que a outra.
 *
 * Criar eventos é gerir a liga (e o dinheiro dela) → canManageEvents.
 *
 * Corpo: { title, date: "2026-07-26", time: "21:00", price: "7,50" }.
 * A hora é de Lisboa, como no formulário.
 *
 * A resposta devolve só o id: as credenciais RTMPS (a chave da stream incluída)
 * vão-se buscar à página de transmissão, por quem tem papel para as ver.
 */
export async function POST(req: Request) {
  const gate = await requireApi(canManageEvents);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido — esperava JSON." }, { status: 400 });
  }

  const checked = validateEventForm(body);
  if (!checked.ok) {
    return NextResponse.json({ error: "Dados inválidos", campos: checked.errors }, { status: 400 });
  }

  try {
    const created = await createEvent(checked.draft);
    return NextResponse.json({ id: created.id }, { status: created.reused ? 200 : 201 });
  } catch (error) {
    console.error("[api/admin/events] criar falhou:", error);
    return NextResponse.json({ error: "Não deu para criar o evento." }, { status: 502 });
  }
}
