import { and, eq, isNotNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { playbackSessions } from "@/db/schema";
import type { AuthUser } from "@/server/authz";
import { heartbeat, revokeSession, startSession } from "@/server/playback";
import { db, limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { criarCanal, criarEntitlement, criarEvento, criarUtilizador } from "../apoio/fabrica";

/*
 * ============================================================================
 *  SESSÕES DE VISIONAMENTO — recarregar não é partilhar
 * ============================================================================
 *
 * O que estes testes existem para impedir que volte:
 *
 * No teste real de 20/07 a régie mostrou **7 "sessões bloqueadas"** para uma
 * pessoa sozinha, num browser só. Não havia partilha de conta nenhuma: o token
 * morria aos 120 s, a pessoa recarregava, e cada recarga carimbava `revoked_at`
 * numa sessão. A métrica que existe para apanhar contas partilhadas estava a
 * contar recargas — e uma métrica que conta a coisa errada é pior do que não
 * existir, porque é acreditada.
 *
 * A contagem da régie (`server/stats.ts`) é `revoked_at is not null` por
 * evento. Por isso a asserção que interessa NÃO é sobre o valor devolvido pelo
 * `startSession`: é sobre as LINHAS que ficam na base, que são o que a régie
 * vai ler. É isso que se conta aqui.
 */

const temBase = temBaseDeDados();

/** O que a régie contaria HOJE, com a query dela, para este evento. */
async function bloqueiosNaRegie(eventId: string): Promise<number> {
  const linhas = await db
    .select({ id: playbackSessions.id })
    .from(playbackSessions)
    .where(and(eq(playbackSessions.eventId, eventId), isNotNull(playbackSessions.revokedAt)));
  return linhas.length;
}

function comoUtilizador(id: string, email: string): AuthUser {
  return { id, name: "Espectador", email, emailVerified: true, role: "viewer", memberships: [] };
}

describe.skipIf(!temBase)("uma conta, um dispositivo, muitas recargas", () => {
  beforeEach(async () => {
    await limparBase();
  });

  it("5 recargas do mesmo browser = 0 bloqueios (era 5)", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });
    const browser = "11111111-1111-4111-8111-111111111111";

    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const { sessionId } = await startSession(espectador.id, evento.id, browser);
      ids.push(sessionId);
    }

    // Seis sessões, cinco substituições — nenhuma delas é um bloqueio.
    expect(new Set(ids).size).toBe(6);
    expect(await bloqueiosNaRegie(evento.id)).toBe(0);

    const substituidas = await db
      .select({ id: playbackSessions.id })
      .from(playbackSessions)
      .where(
        and(eq(playbackSessions.eventId, evento.id), isNotNull(playbackSessions.supersededAt)),
      );
    expect(substituidas).toHaveLength(5);
  });

  it("um segundo dispositivo = 1 bloqueio, com o motivo à frente", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });

    await startSession(espectador.id, evento.id, "11111111-1111-4111-8111-111111111111");
    const segundo = await startSession(
      espectador.id,
      evento.id,
      "22222222-2222-4222-8222-222222222222",
    );

    expect(segundo.blocked).toBe(1);
    expect(await bloqueiosNaRegie(evento.id)).toBe(1);

    const [cortada] = await db
      .select()
      .from(playbackSessions)
      .where(and(eq(playbackSessions.eventId, evento.id), isNotNull(playbackSessions.revokedAt)));
    expect(cortada.revokedReason).toBe("other_device");
  });

  it("sem cookie de dispositivo conta como dispositivo diferente — na dúvida, levanta a mão", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });

    await startSession(espectador.id, evento.id, null);
    const segunda = await startSession(espectador.id, evento.id, null);

    expect(segunda.blocked).toBe(1);
    expect(await bloqueiosNaRegie(evento.id)).toBe(1);
  });

  it("o mesmo dispositivo noutro evento fecha o anterior sem o contar como bloqueio", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const [a, b] = await Promise.all([
      criarEvento(canal.id, { status: "live" }),
      criarEvento(canal.id, { status: "live" }),
    ]);
    const browser = "33333333-3333-4333-8333-333333333333";

    await startSession(espectador.id, a.id, browser);
    const segunda = await startSession(espectador.id, b.id, browser);

    expect(segunda.blocked).toBe(0);
    // E a régie do evento A também não vê bloqueio nenhum — é a mesma pessoa
    // no mesmo sítio a mudar de sala, não uma conta partilhada.
    expect(await bloqueiosNaRegie(a.id)).toBe(0);
  });

  it("a regra continua a ser uma reprodução de cada vez: a sessão substituída pára", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });
    await criarEntitlement(espectador.id, evento.id, { status: "active" });
    const browser = "44444444-4444-4444-8444-444444444444";

    const primeira = await startSession(espectador.id, evento.id, browser);
    const segunda = await startSession(espectador.id, evento.id, browser);
    const user = comoUtilizador(espectador.id, espectador.email);

    // A antiga deixa de responder; a nova continua viva. Silencioso ≠ tolerado.
    expect(await heartbeat(primeira.sessionId, user)).toEqual({
      active: false,
      reason: "superseded",
    });
    expect(await heartbeat(segunda.sessionId, user)).toEqual({ active: true });
  });

  it("outro dispositivo dá 'revoked' ao antigo — o ecrã de alarme é para este caso", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });
    await criarEntitlement(espectador.id, evento.id, { status: "active" });

    const casa = await startSession(
      espectador.id,
      evento.id,
      "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    );
    await startSession(espectador.id, evento.id, "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb");

    expect(
      await heartbeat(casa.sessionId, comoUtilizador(espectador.id, espectador.email)),
    ).toEqual({ active: false, reason: "revoked" });
  });
});

describe.skipIf(!temBase)("o heartbeat de outra pessoa", () => {
  beforeEach(async () => {
    await limparBase();
  });

  it("não corta nem confirma a sessão alheia", async () => {
    const canal = await criarCanal();
    const [dona, intruso] = await Promise.all([criarUtilizador(), criarUtilizador()]);
    const evento = await criarEvento(canal.id, { status: "live" });
    await criarEntitlement(dona.id, evento.id, { status: "active" });

    const sessao = await startSession(dona.id, evento.id, "cccccccc-3333-4333-8333-cccccccccccc");

    // O intruso sabe o id (não é segredo) e não consegue lá tocar…
    expect(await heartbeat(sessao.sessionId, comoUtilizador(intruso.id, intruso.email))).toEqual({
      active: false,
      reason: "revoked",
    });
    expect(await revokeSession(sessao.sessionId, intruso.id, "watermark")).toBe(false);

    // …e a dona continua a ver.
    expect(await heartbeat(sessao.sessionId, comoUtilizador(dona.id, dona.email))).toEqual({
      active: true,
    });
  });
});

describe.skipIf(!temBase)("a marca de água adulterada", () => {
  beforeEach(async () => {
    await limparBase();
  });

  it("revoga a sessão com motivo `watermark` e o player pára no heartbeat seguinte", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });
    await criarEntitlement(espectador.id, evento.id, { status: "active" });

    const sessao = await startSession(
      espectador.id,
      evento.id,
      "dddddddd-4444-4444-8444-dddddddddddd",
    );
    expect(await revokeSession(sessao.sessionId, espectador.id, "watermark")).toBe(true);

    const [linha] = await db
      .select()
      .from(playbackSessions)
      .where(eq(playbackSessions.id, sessao.sessionId));
    expect(linha.revokedReason).toBe("watermark");

    expect(
      await heartbeat(sessao.sessionId, comoUtilizador(espectador.id, espectador.email)),
    ).toEqual({ active: false, reason: "revoked" });
  });

  it("é idempotente — o segundo aviso não reescreve o carimbo", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });

    const sessao = await startSession(
      espectador.id,
      evento.id,
      "eeeeeeee-5555-4555-8555-eeeeeeeeeeee",
    );
    expect(await revokeSession(sessao.sessionId, espectador.id, "watermark")).toBe(true);
    expect(await revokeSession(sessao.sessionId, espectador.id, "watermark")).toBe(false);
  });
});

describe.skipIf(!temBase)("o direito de ver, revalidado a meio", () => {
  beforeEach(async () => {
    await limparBase();
  });

  /*
   * Com o token de 120 s, um reembolso a meio do evento cortava o acesso em
   * dois minutos por acidente (o player rebentava e o mint seguinte recusava).
   * Com o TTL a 12 h isso desaparecia. O heartbeat repõe a proteção — e este
   * teste é o que impede que ela se perca outra vez sem ninguém dar por isso.
   */
  it("corta quando o direito desaparece a meio", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });
    const direito = await criarEntitlement(espectador.id, evento.id, { status: "active" });
    const user = comoUtilizador(espectador.id, espectador.email);

    const sessao = await startSession(
      espectador.id,
      evento.id,
      "ffffffff-6666-4666-8666-ffffffffffff",
    );
    expect(await heartbeat(sessao.sessionId, user)).toEqual({ active: true });

    // O reembolso.
    const { entitlements } = await import("@/db/schema");
    await db
      .update(entitlements)
      .set({ status: "refunded" })
      .where(eq(entitlements.id, direito.id));

    /*
     * A revalidação é uma por cada janela de 2 minutos desde o início da
     * sessão — recuar os carimbos é o equivalente a esperar, sem esperar.
     */
    const passado = new Date(Date.now() - 5 * 60_000);
    await db
      .update(playbackSessions)
      .set({ startedAt: passado, lastHeartbeatAt: passado })
      .where(eq(playbackSessions.id, sessao.sessionId));

    expect(await heartbeat(sessao.sessionId, user)).toEqual({
      active: false,
      reason: "no-access",
    });

    const [linha] = await db
      .select()
      .from(playbackSessions)
      .where(eq(playbackSessions.id, sessao.sessionId));
    expect(linha.revokedReason).toBe("no_access");
  });

  it("não revalida a cada batida — o custo tem de continuar a ser uma query", async () => {
    const canal = await criarCanal();
    const espectador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });
    const direito = await criarEntitlement(espectador.id, evento.id, { status: "active" });
    const user = comoUtilizador(espectador.id, espectador.email);

    const sessao = await startSession(
      espectador.id,
      evento.id,
      "99999999-7777-4777-8777-999999999999",
    );

    const { entitlements } = await import("@/db/schema");
    await db
      .update(entitlements)
      .set({ status: "refunded" })
      .where(eq(entitlements.id, direito.id));

    // Dentro da mesma janela de 2 min: ainda não revalidou, logo não corta.
    expect(await heartbeat(sessao.sessionId, user)).toEqual({ active: true });
  });

  it("o dono do canal não precisa de direito comprado — e não é cortado por não o ter", async () => {
    const canal = await criarCanal();
    const dono = await criarUtilizador();
    const evento = await criarEvento(canal.id, { status: "live" });
    const user: AuthUser = {
      ...comoUtilizador(dono.id, dono.email),
      memberships: [{ channelId: canal.id, role: "owner" }],
    };

    const sessao = await startSession(dono.id, evento.id, "88888888-8888-4888-8888-888888888888");
    const passado = new Date(Date.now() - 5 * 60_000);
    await db
      .update(playbackSessions)
      .set({ startedAt: passado, lastHeartbeatAt: passado })
      .where(eq(playbackSessions.id, sessao.sessionId));

    expect(await heartbeat(sessao.sessionId, user)).toEqual({ active: true });
  });
});
