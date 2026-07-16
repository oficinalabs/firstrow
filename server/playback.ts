import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { playbackSessions } from "@/db/schema";
import { newId } from "@/lib/ids";

// Inicia uma sessão de visualização. Regra: 1 sessão a ver por conta (newest-wins).
// Ao começar, revoga as outras sessões ativas da conta — quem começar por último
// fica com o stream, o anterior é cortado no próximo heartbeat.
export async function startSession(userId: string, eventId: string): Promise<string> {
  await db
    .update(playbackSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(playbackSessions.userId, userId), isNull(playbackSessions.revokedAt)));

  const id = newId();
  await db.insert(playbackSessions).values({ id, userId, eventId });
  return id;
}

// Heartbeat: devolve se a sessão continua ativa (não foi revogada por outra).
export async function heartbeat(sessionId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(playbackSessions)
    .where(and(eq(playbackSessions.id, sessionId), eq(playbackSessions.userId, userId)))
    .limit(1);

  const session = rows[0];
  if (!session || session.revokedAt) return false;

  await db
    .update(playbackSessions)
    .set({ lastHeartbeatAt: new Date() })
    .where(eq(playbackSessions.id, sessionId));
  return true;
}
