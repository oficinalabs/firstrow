import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { playbackSessions, type RevokeReason } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { AuthUser } from "@/server/authz";
import { canWatchEvent } from "@/server/event-access";
import { getEvent } from "@/server/events";

/*
 * ============================================================================
 *  SESSÕES DE VISIONAMENTO — uma reprodução de cada vez, por DISPOSITIVO
 * ============================================================================
 *
 * A regra do produto continua a mesma: uma conta vê num sítio de cada vez, e
 * quem começa por último fica com o stream. O que mudou foi o que conta como
 * "outro sítio".
 *
 * ANTES: qualquer `POST /session` revogava as sessões vivas da conta. Como o
 * token de reprodução morria aos 120 s (ver `lib/cloudflare.ts`), o espectador
 * recarregava a página de dois em dois minutos — e cada recarga carimbava
 * `revokedAt` numa sessão. A régie do teste real mostrou **7 "sessões
 * cortadas"** para uma pessoa sozinha, num browser só. A métrica que existe
 * para apanhar partilha de conta estava a contar recargas.
 *
 * AGORA: a sessão traz o dispositivo (cookie httpOnly, ver
 * `app/api/playback/[eventId]/session/route.ts`).
 *
 *   mesmo dispositivo  → `supersededAt` na antiga: silencioso, não é bloqueio
 *   outro dispositivo  → `revokedAt` + motivo: é isto que a régie deve contar
 *
 * Nos dois casos a sessão antiga deixa de responder ao heartbeat — a regra de
 * uma reprodução de cada vez não foi relaxada. O que mudou foi só a etiqueta,
 * e a etiqueta é a métrica.
 *
 * O DISPOSITIVO NÃO AUTORIZA NADA. É um cookie, logo é do cliente, logo
 * mente-se-lhe. Quem copie o cookie de outra pessoa consegue... que a sua
 * tomada de sessão não apareça na contagem de bloqueios. Não consegue ver sem
 * comprar (isso é o `canWatchEvent` no mint), nem ver em dois sítios ao mesmo
 * tempo (isso é o carimbo, que acontece na mesma). O pior que um `deviceId`
 * forjado faz é falsear uma métrica que já não existia antes desta mudança.
 */

/** Uma sessão viva: nem substituída nem revogada. */
const viva = and(isNull(playbackSessions.supersededAt), isNull(playbackSessions.revokedAt));

export type SessionStart = {
  sessionId: string;
  /** Quantas sessões de OUTRO dispositivo foram cortadas para esta começar. */
  blocked: number;
};

/**
 * Inicia uma sessão de visionamento e fecha as anteriores da mesma conta.
 *
 * `deviceId` a `null` (cliente sem cookies, sessão antiga) segue o caminho
 * conservador: trata-se como dispositivo desconhecido e conta como bloqueio.
 * Preferimos um falso positivo na métrica a um falso negativo — a métrica
 * existe para levantar a mão, não para absolver.
 */
export async function startSession(
  userId: string,
  eventId: string,
  deviceId: string | null,
): Promise<SessionStart> {
  const agora = new Date();

  /*
   * Fechar as vivas em duas passagens, ambas com `returning()` para saber o
   * que foi realmente fechado (é daí que sai a contagem de bloqueios — não de
   * uma leitura anterior que outra sessão podia ter invalidado entretanto).
   *
   * A primeira só apanha o mesmo dispositivo; a segunda apanha o resto. Um
   * `deviceId` nulo nunca casa (`eq(col, null)` não é verdade em SQL, e é isso
   * mesmo que se quer): cai todo na segunda.
   */
  if (deviceId) {
    await db
      .update(playbackSessions)
      .set({ supersededAt: agora })
      .where(
        and(eq(playbackSessions.userId, userId), eq(playbackSessions.deviceId, deviceId), viva),
      );
  }

  const bloqueadas = await db
    .update(playbackSessions)
    .set({ revokedAt: agora, revokedReason: "other_device" satisfies RevokeReason })
    .where(and(eq(playbackSessions.userId, userId), viva))
    .returning({ id: playbackSessions.id });

  const id = newId();
  await db.insert(playbackSessions).values({ id, userId, eventId, deviceId });
  return { sessionId: id, blocked: bloqueadas.length };
}

/**
 * Revoga uma sessão concreta desta conta, com motivo.
 *
 * Filtra por `userId` de propósito: o id de sessão vem do cliente e não é
 * segredo nenhum — sem este filtro, quem soubesse o id de outra pessoa
 * cortava-lhe a transmissão.
 */
export async function revokeSession(
  sessionId: string,
  userId: string,
  reason: RevokeReason,
): Promise<boolean> {
  const fechadas = await db
    .update(playbackSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(playbackSessions.id, sessionId), eq(playbackSessions.userId, userId), viva))
    .returning({ id: playbackSessions.id });
  return fechadas.length > 0;
}

/** Porque é que o player parou. O cliente traduz para o ecrã certo. */
export type HeartbeatResult =
  | { active: true }
  /** Outro dispositivo tomou a sessão — o ecrã de "conta a ver noutro sítio". */
  | { active: false; reason: "revoked" }
  /** O mesmo dispositivo recomeçou noutro separador — não é alarme. */
  | { active: false; reason: "superseded" }
  /** Deixou de ter direito a ver (reembolso, estorno) a meio. */
  | { active: false; reason: "no-access" };

/*
 * De quanto em quanto tempo é que o heartbeat volta a perguntar "esta pessoa
 * ainda pode ver isto?".
 *
 * PORQUE EXISTE: com o token de 120 s, um reembolso a meio do evento cortava
 * o acesso em dois minutos — não por desenho, mas porque o player rebentava e
 * o mint seguinte recusava. Ao pôr o TTL a 12 h, essa proteção acidental
 * desaparecia e um estorno deixava de ter efeito até ao fim do evento. Isto
 * repõe-a, agora de propósito e com o nome à frente.
 *
 * PORQUÊ 2 MINUTOS E NÃO A CADA BATIDA: a revalidação são duas queries
 * (evento + direito). A 20 s por batida e 150 espectadores seriam ~15 q/s só
 * para isto; a cada 2 min são ~2,5 q/s. O atraso máximo entre o reembolso e o
 * corte passa a ser 2 minutos, o que é a mesma ordem de grandeza do que havia.
 */
const REVALIDATE_MS = 120_000;

/**
 * Heartbeat: a sessão ainda está viva?
 *
 * ⚠️ O que isto NÃO faz: parar o vídeo. Quem tem o token da Cloudflare na mão
 * continua a receber segmentos até o token expirar, mesmo com a sessão
 * revogada — o corte é do nosso player, não do edge da Cloudflare. Contra um
 * espectador normal chega; contra quem edite o nosso JS, não. Ver a nota de
 * honestidade em `components/player/watch-player.tsx`.
 */
export async function heartbeat(sessionId: string, user: AuthUser): Promise<HeartbeatResult> {
  const rows = await db
    .select()
    .from(playbackSessions)
    .where(and(eq(playbackSessions.id, sessionId), eq(playbackSessions.userId, user.id)))
    .limit(1);

  const session = rows[0];
  // Sessão inexistente responde como revogada: quem chama não distingue, e
  // não tem como distinguir a de outra pessoa de uma que nunca existiu.
  if (!session) return { active: false, reason: "revoked" };
  if (session.supersededAt) return { active: false, reason: "superseded" };
  if (session.revokedAt) return { active: false, reason: "revoked" };

  const agora = Date.now();
  /*
   * Uma revalidação por cada janela de `REVALIDATE_MS` desde o início da
   * sessão, sem coluna nova para o registar: comparam-se as janelas do
   * heartbeat anterior e deste. Determinístico (dá para testar), e a batida
   * seguinte não repete o trabalho da anterior.
   */
  const janela = (t: number) => Math.floor((t - session.startedAt.getTime()) / REVALIDATE_MS);
  if (janela(agora) > janela(session.lastHeartbeatAt.getTime())) {
    const event = await getEvent(session.eventId);
    if (!event || !(await canWatchEvent(user, event))) {
      await db
        .update(playbackSessions)
        .set({ revokedAt: new Date(), revokedReason: "no_access" satisfies RevokeReason })
        .where(and(eq(playbackSessions.id, sessionId), viva));
      return { active: false, reason: "no-access" };
    }
  }

  await db
    .update(playbackSessions)
    .set({ lastHeartbeatAt: new Date(agora) })
    .where(eq(playbackSessions.id, sessionId));
  return { active: true };
}
