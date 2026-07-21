import { NextResponse } from "next/server";
import { attachDeviceCookie, newDeviceId, readDeviceId } from "@/app/api/playback/device";
import { signPlaybackToken, streamIframeUrl } from "@/lib/cloudflare";
import { limitByAccountShared } from "@/lib/rate-limit";
import { requireApi } from "@/server/api-guard";
import { canWatchEvent, playbackTarget } from "@/server/event-access";
import { getEvent } from "@/server/events";
import { startSession } from "@/server/playback";

/*
 * MINT DO TOKEN DE REPRODUÇÃO — a rota que transforma "comprei" em "vejo".
 *
 * A autorização é a posse do direito (ter comprado) OU operar o canal DESTE
 * evento — quem organiza a liga tem de conseguir rever a própria transmissão
 * sem a comprar. O papel é sempre verificado contra o canal do evento: o dono
 * da liga A não vê de graça o conteúdo pago da liga B.
 *
 * Limite por conta: cada `POST` assina um token novo, e um token é acesso.
 * Sem travão, uma conta comprada uma vez podia servir de fábrica de tokens
 * para distribuir. 12/min dá para recarregar a página à vontade e não dá
 * para alimentar uma audiência.
 *
 * A chave é SÓ a conta, e é o contador PARTILHADO. Antes desta frente era o
 * contador de memória com a chave `IP|conta` — ou seja, a fábrica de tokens que
 * este limite existe para fechar estava aberta duas vezes: o contador não
 * sobrevivia entre instâncias, e quem revendesse acesso a partir de dados
 * móveis ganhava 12 tokens novos a cada IP.
 *
 * O DISPOSITIVO (cookie `fr_dv`, ver `../../device.ts`) entra aqui e só aqui:
 * é o primeiro sítio onde há um espectador a começar a ver. Quem chega sem
 * cookie leva um na resposta — daí em diante, recarregar a página deixa de
 * parecer uma tomada de sessão.
 */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  const limited = await limitByAccountShared("playback", gate.user.id);
  if (limited) return limited;

  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  /*
   * QUAL vídeo, antes de assinar seja o que for. A gravação e o direto são
   * recursos diferentes na Cloudflare e o token é assinado para um deles (vai
   * no `sub`). Isto assinava sempre o live input — e por isso nenhuma gravação
   * tocava, nem para quem tinha pago.
   */
  const target = playbackTarget(event);
  if (!target) {
    return NextResponse.json({ error: "Este evento ainda não tem vídeo" }, { status: 404 });
  }

  if (!(await canWatchEvent(gate.user, event))) {
    return NextResponse.json({ error: "Sem acesso a este evento" }, { status: 403 });
  }

  // Sem cookie ainda? Este é o primeiro play deste browser: nasce aqui.
  const deviceId = readDeviceId(req) ?? newDeviceId();

  // Concorrência: fecha as sessões anteriores da conta (silenciosamente se for
  // o mesmo dispositivo) e assina o token para o recurso certo, com um TTL que
  // cobre a visualização inteira — ver `lib/cloudflare.ts`.
  const { sessionId } = await startSession(gate.user.id, eventId, deviceId);
  const token = await signPlaybackToken(target.id, target.isVod ? "vod" : "live");

  return attachDeviceCookie(
    NextResponse.json({ sessionId, iframeUrl: streamIframeUrl(token) }),
    deviceId,
  );
}
