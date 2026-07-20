import { NextResponse } from "next/server";
import { deleteMessage, openChat } from "@/server/chat";

/*
 * Apagar uma mensagem — soft-delete, feito por quem OPERA o canal deste evento.
 *
 * O poder é verificado por `openChat` contra o canal do evento, e a escrita em
 * `deleteMessage` volta a exigir que a mensagem pertença a esse evento. As duas
 * coisas são precisas: a primeira diz "podes moderar AQUI", a segunda garante
 * que o alvo é mesmo daqui. Sem a segunda, um id de mensagem de outra liga
 * passava — é a moderação cruzada entre canais, e está testada.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; messageId: string }> },
) {
  const { eventId, messageId } = await params;

  const access = await openChat(eventId);
  if (!access.ok) {
    return access.reason === "anonymous"
      ? NextResponse.json({ error: "Precisas de iniciar sessão." }, { status: 401 })
      : NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  }

  const resultado = await deleteMessage(access, messageId);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }

  return NextResponse.json({ ok: true });
}
