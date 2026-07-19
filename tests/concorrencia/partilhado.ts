import { and, eq, sql } from "drizzle-orm";
import { channelMembers } from "@/db/schema";
import { db } from "../apoio/base-de-dados";

/*
 * O que os testes de concorrência partilham.
 *
 * `RONDAS` é o mesmo número para o canário e para os testes a sério, e isso é
 * importante: só assim é que o canário prova alguma coisa sobre eles. Se o
 * canário corresse 12 rondas e o teste real 2, o canário deixava de ser prova
 * de nada — estaria a validar uma sensibilidade que o outro não tem.
 *
 * A justificação do 12 está em `canario.test.ts`.
 */
export const RONDAS = 12;

/** Quantos donos tem este canal, lido diretamente da base. */
export async function donosDe(channelId: string): Promise<number> {
  const linhas = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.role, "owner")));
  return linhas[0]?.n ?? 0;
}
