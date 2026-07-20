import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/authz";
import { getLikes, toggleLike } from "@/server/chat";
import { getEvent } from "@/server/events";

/*
 * ============================================================================
 *  GOSTO — contagem pública, identidade privada
 * ============================================================================
 *
 * Decisão do dono, e é ela que desenha esta rota: qualquer pessoa vê QUANTOS
 * gostos um evento tem; ninguém vê QUEM gostou. Por isso a resposta é sempre um
 * número e um booleano sobre a própria conta — nunca uma lista.
 *
 * O gosto NÃO é conteúdo pago: vive na página pública do evento, que qualquer
 * um abre. Por isso a leitura não passa por `canWatchEvent` — passa só pela
 * existência do evento. Votar, esse, exige sessão.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const evento = await getEvent(eventId);
  if (!evento) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });

  const user = await getCurrentUser();
  return NextResponse.json(await getLikes(eventId, user?.id ?? null));
}

/** Alternar o gosto. Um por conta — o índice único é quem o garante. */
export async function POST(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Precisas de iniciar sessão para gostar." }, { status: 401 });
  }

  const evento = await getEvent(eventId);
  if (!evento) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });

  return NextResponse.json(await toggleLike(eventId, user.id));
}
