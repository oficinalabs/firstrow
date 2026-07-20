import { NextResponse } from "next/server";
import { checkRateLimitShared, rateLimitResponse } from "@/lib/rate-limit";
import {
  CHAT_BODY_MAX_CHARS,
  CHAT_MESSAGES_PER_MINUTE,
  chatSnapshot,
  normalizeBody,
  olderMessages,
  openChat,
  postMessage,
} from "@/server/chat";

/*
 * ============================================================================
 *  A ROTA DA CONVERSA — ler (polling) e escrever
 * ============================================================================
 *
 * As duas metades passam pelo MESMO portão, `openChat`, que por sua vez usa
 * `canWatchEvent` — a regra do player. Quem não comprou não lê nem escreve, e
 * não há nesta rota nenhuma decisão de acesso própria: se houvesse, seria a
 * segunda opinião que esta plataforma já aprendeu a não ter.
 *
 * SEM SESSÃO → 401. COM SESSÃO E SEM ACESSO → 404, o mesmo que um evento
 * inventado devolve. É a regra da casa (`docs/SEGURANCA-APP.md`): um 403
 * confirmava que o evento existe e deixava mapear a programação da liga do lado.
 */

const NAO_AUTENTICADO = "Precisas de iniciar sessão.";
const SEM_EVENTO = "Evento não encontrado.";

function recusa(reason: "anonymous" | "denied"): NextResponse {
  return reason === "anonymous"
    ? NextResponse.json({ error: NAO_AUTENTICADO }, { status: 401 })
    : NextResponse.json({ error: SEM_EVENTO }, { status: 404 });
}

/**
 * O polling, e também o "carregar mais antigas" do arquivo (`?antes=`).
 *
 * Os dois na mesma rota de propósito: é a mesma leitura, com o mesmo portão,
 * só muda a direção. Uma rota à parte era um segundo sítio para lá chegar — e
 * um segundo sítio para alguém, um dia, se esquecer do portão.
 */
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const access = await openChat(eventId);
  if (!access.ok) return recusa(access.reason);

  const url = new URL(req.url);
  const antes = url.searchParams.get("antes");

  if (antes) {
    return NextResponse.json(await olderMessages(access, antes));
  }

  return NextResponse.json(
    await chatSnapshot(access, {
      cursor: url.searchParams.get("cursor"),
      since: url.searchParams.get("desde"),
    }),
  );
}

/**
 * Escrever uma mensagem.
 *
 * O travão é o contador PARTILHADO em Postgres (`checkRateLimitShared`), não o
 * de memória: na Vercel cada instância tem o seu `Map` e uma instância fria
 * começa do zero, por isso o de memória quase não é limite nenhum. A chave é a
 * CONTA — ver a nota em `server/chat.ts`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const access = await openChat(eventId);
  if (!access.ok) return recusa(access.reason);

  const limite = await checkRateLimitShared("chat", access.user.id, CHAT_MESSAGES_PER_MINUTE);
  if (!limite.allowed) return rateLimitResponse(limite);

  const payload = await req.json().catch(() => null);
  const corpo = normalizeBody((payload as { body?: unknown } | null)?.body);
  if (!corpo) {
    return NextResponse.json(
      { error: `Escreve alguma coisa (até ${CHAT_BODY_MAX_CHARS} caracteres).` },
      { status: 400 },
    );
  }

  const resultado = await postMessage(access, corpo);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }

  return NextResponse.json({ message: resultado.message }, { status: 201 });
}
