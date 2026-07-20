import { NextResponse } from "next/server";
import { readDeviceId } from "@/app/api/playback/device";
import { requireApi } from "@/server/api-guard";
import { revokeSession } from "@/server/playback";

/*
 * ============================================================================
 *  A MARCA DE ÁGUA DEIXOU DE ESTAR NO ECRÃ — corta e regista
 * ============================================================================
 *
 * Quem chama isto é o vigia do player (`components/player/watermark.tsx`)
 * quando a marca é removida, escondida, tornada transparente, encolhida,
 * empurrada para fora do enquadramento ou tapada por outro elemento.
 *
 * A resposta da plataforma é fechar a sessão com motivo `watermark`. A partir
 * daí o heartbeat de qualquer separador aberto devolve "revogada" e o player
 * pára. Apagar a marca passa a custar o vídeo.
 *
 * ⚠️ O QUE ISTO NÃO É: uma prova. O aviso vem do browser, logo vem do lado que
 * se quer vigiar. Duas consequências, e nenhuma se resolve deste lado:
 *
 *  1. Quem edite o nosso JS (ou bloqueie este pedido) não é apanhado. A defesa
 *     serve contra a remoção casual pelo inspetor, não contra quem escreve
 *     código. Não vender às ligas como mais do que isto.
 *  2. Quem quiser pode chamar isto à mão e cortar-se a si próprio. Só a si:
 *     `revokeSession` filtra por `userId` e por id de sessão. Auto-sabotagem
 *     não é ameaça, é um botão de "parar" caro.
 *
 * O valor real é o REGISTO: fica no motivo da revogação, com conta, evento e
 * dispositivo, para a liga poder decidir um ban com um facto à frente.
 */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => null)) as {
    sessionId?: string;
    detail?: string;
  } | null;
  if (!body?.sessionId) return NextResponse.json({ error: "Sessão em falta" }, { status: 400 });

  const revoked = await revokeSession(body.sessionId, gate.user.id, "watermark");

  /*
   * O registo. Vai para os logs do servidor (Vercel) com tudo o que a liga
   * precisa para decidir, e nada mais: a conta, o evento, o dispositivo e o
   * que falhou. `detail` vem do cliente — por isso entra cortado e como dado,
   * nunca interpolado em nada que seja executado ou consultado.
   */
  console.warn(
    JSON.stringify({
      evento: "marca-de-agua-adulterada",
      eventId,
      userId: gate.user.id,
      email: gate.user.email,
      deviceId: readDeviceId(req),
      sessionRevogada: revoked,
      motivo: (body.detail ?? "desconhecido").slice(0, 80),
      em: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ revoked });
}
