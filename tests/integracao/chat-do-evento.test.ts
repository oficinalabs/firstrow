import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/db/auth-schema";
import { chatMessages } from "@/db/schema";
import { type AuthUser, loadMemberships } from "@/server/authz";
import {
  chatPhase,
  chatSnapshot,
  deleteMessage,
  muteUser,
  normalizeBody,
  olderMessages,
  openChatFor,
  postMessage,
} from "@/server/chat";
import { db, limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import {
  criarCanal,
  criarEntitlement,
  criarEvento,
  criarMembro,
  criarMensagem,
  criarUtilizador,
} from "../apoio/fabrica";

/*
 * ============================================================================
 *  A CONVERSA DO EVENTO — quem entra, quem modera, e o que o apagar faz
 * ============================================================================
 *
 * O que estes testes existem para impedir, por ordem de gravidade:
 *
 *  1. QUEM NÃO COMPROU VER O CHAT. É produto pago; o chat faz parte dele. A
 *     regra é `canWatchEvent` — a mesma do player — e o que se prova aqui é que
 *     o portão da conversa não tem uma segunda opinião sobre ela.
 *  2. MODERAÇÃO A ATRAVESSAR CANAIS. O dono da liga A não pode apagar nem
 *     silenciar na liga B. É o caso que um `where` esquecido abre em silêncio,
 *     por isso está testado com o id de uma mensagem de outro canal na mão.
 *  3. O APAGAR SER MESMO SOFT. A linha fica; o que desaparece é a mensagem do
 *     ecrã. Sem isto não há auditoria de moderação nenhuma.
 *
 * Os testes chamam `openChatFor` — o portão a sério — e não montam o `access`
 * à mão. Um `access` fabricado provava uma cópia da regra, que é exatamente o
 * erro contra o qual toda esta frente foi escrita.
 */

/** Um `AuthUser` com as filiações REAIS da base — nunca uma lista inventada. */
async function comoUtilizador(
  conta: { id: string; name: string; email: string; emailVerified: boolean },
  role: Role = "viewer",
): Promise<AuthUser> {
  return {
    id: conta.id,
    name: conta.name,
    email: conta.email,
    emailVerified: conta.emailVerified,
    role,
    memberships: await loadMemberships(conta.id),
  };
}

/** Abre a conversa e falha o teste se o portão tiver recusado. */
async function abrir(user: AuthUser, eventId: string) {
  const acesso = await openChatFor(user, eventId);
  if (!acesso.ok) throw new Error(`o portão recusou: ${acesso.reason}`);
  return acesso;
}

describe("chatPhase — em que vida está a conversa", () => {
  const evento = (status: string, startsAt: Date) =>
    ({ status, startsAt }) as Parameters<typeof chatPhase>[0];

  it("está `live` enquanto a transmissão estiver no ar", () => {
    expect(chatPhase(evento("live", new Date()))).toBe("live");
  });

  it("está `fechado` antes de começar — não há conversa num rascunho", () => {
    expect(chatPhase(evento("draft", new Date()))).toBe("fechado");
  });

  it("passa a `arquivo` quando o evento acaba", () => {
    const ontem = new Date(Date.now() - 86_400_000);
    expect(chatPhase(evento("ended", ontem))).toBe("arquivo");
  });

  /*
   * Decisão do dono: os comentários fecham quando o VOD expira (30 dias). Um
   * evento de há 31 dias já não recebe comentários novos.
   */
  it("fecha quando o VOD expira, aos 30 dias", () => {
    const ha31Dias = new Date(Date.now() - 31 * 86_400_000);
    expect(chatPhase(evento("ended", ha31Dias))).toBe("fechado");

    const ha29Dias = new Date(Date.now() - 29 * 86_400_000);
    expect(chatPhase(evento("ended", ha29Dias))).toBe("arquivo");
  });
});

describe("normalizeBody — o que chega à base", () => {
  it("corta a mensagem no limite em vez de a recusar", () => {
    const corpo = normalizeBody("a".repeat(500));
    expect(corpo).toHaveLength(300);
  });

  it("recusa o que não tem conteúdo nenhum", () => {
    expect(normalizeBody("   \n\n  ")).toBeNull();
    expect(normalizeBody("")).toBeNull();
    expect(normalizeBody(42)).toBeNull();
  });

  /*
   * Quarenta linhas em branco não são uma mensagem: são um empurrão ao resto da
   * conversa para fora do ecrã de quem está no telemóvel.
   */
  it("colapsa as linhas em branco a mais", () => {
    expect(normalizeBody("olá\n\n\n\n\n\nadeus")).toBe("olá\n\nadeus");
  });

  it("não filtra linguagem — é battle rap, e a moderação é humana", () => {
    // Se um dia alguém acrescentar um filtro automático, este teste cai e
    // obriga a conversa a acontecer antes de a decisão mudar sozinha.
    expect(normalizeBody("caralho que rima do caraças")).toBe("caralho que rima do caraças");
  });
});

describe.skipIf(!temBaseDeDados())("quem entra na conversa", () => {
  beforeEach(limparBase);

  it("deixa entrar quem comprou — e não lhe dá moderação", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const comprador = await criarUtilizador();
    await criarEntitlement(comprador.id, evento.id, { status: "active" });

    const acesso = await openChatFor(await comoUtilizador(comprador), evento.id);

    expect(acesso.ok).toBe(true);
    if (acesso.ok) expect(acesso.moderator).toBe(false);
  });

  /* O CORAÇÃO DESTA FRENTE: sem compra, não há chat. */
  it("recusa quem não comprou", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const estranho = await criarUtilizador();

    const acesso = await openChatFor(await comoUtilizador(estranho), evento.id);

    expect(acesso).toEqual({ ok: false, reason: "denied" });
  });

  /*
   * Uma compra PENDENTE não é uma compra. Quem clicou em comprar e não pagou
   * fica exactamente como quem não clicou.
   */
  it("recusa quem tem a compra por pagar", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const indeciso = await criarUtilizador();
    await criarEntitlement(indeciso.id, evento.id, { status: "pending" });

    const acesso = await openChatFor(await comoUtilizador(indeciso), evento.id);

    expect(acesso).toEqual({ ok: false, reason: "denied" });
  });

  it("deixa entrar (e moderar) quem opera o canal, sem ter comprado", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const [dono, equipa] = await Promise.all([criarUtilizador(), criarUtilizador()]);
    await criarMembro(canal.id, dono.id, "owner");
    await criarMembro(canal.id, equipa.id, "staff");

    const acessoDono = await abrir(await comoUtilizador(dono), evento.id);
    const acessoEquipa = await abrir(await comoUtilizador(equipa), evento.id);

    expect(acessoDono.moderator).toBe(true);
    expect(acessoEquipa.moderator).toBe(true);
  });

  /*
   * A FUGA ENTRE LIGAS. Ser dono da liga A não dá nada na liga B — nem sequer
   * o direito de ler. É a mesma regra do resto do backoffice.
   */
  it("recusa o dono de OUTRO canal — não é acesso, nem meio acesso", async () => {
    const [canalA, canalB] = await Promise.all([criarCanal(), criarCanal()]);
    const eventoB = await criarEvento(canalB.id, { status: "live" });
    const donoDoA = await criarUtilizador();
    await criarMembro(canalA.id, donoDoA.id, "owner");

    const acesso = await openChatFor(await comoUtilizador(donoDoA), eventoB.id);

    expect(acesso).toEqual({ ok: false, reason: "denied" });
  });

  it("deixa entrar o platform_admin em qualquer canal", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const nos = await criarUtilizador();

    const acesso = await abrir(await comoUtilizador(nos, "platform_admin"), evento.id);

    expect(acesso.moderator).toBe(true);
  });

  it("responde `denied` a um evento que não existe — igual a um que não é teu", async () => {
    const alguem = await criarUtilizador();
    const acesso = await openChatFor(await comoUtilizador(alguem), "evento-que-nunca-existiu");
    expect(acesso).toEqual({ ok: false, reason: "denied" });
  });
});

describe.skipIf(!temBaseDeDados())("escrever e ler", () => {
  beforeEach(limparBase);

  it("mostra a mensagem a quem comprou, com o papel do autor", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const dono = await criarUtilizador();
    const comprador = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");
    await criarEntitlement(comprador.id, evento.id, { status: "active" });

    const acessoDono = await abrir(await comoUtilizador(dono), evento.id);
    await postMessage(acessoDono, "bem-vindos à batalha");

    const acessoComprador = await abrir(await comoUtilizador(comprador), evento.id);
    const leitura = await chatSnapshot(acessoComprador);

    expect(leitura.messages).toHaveLength(1);
    expect(leitura.messages[0].body).toBe("bem-vindos à batalha");
    // O distintivo vem de `channel_members`, resolvido contra ESTE canal.
    expect(leitura.messages[0].authorRole).toBe("owner");
    expect(leitura.canWrite).toBe(true);
  });

  /*
   * O staff da liga A não pode aparecer com autoridade na conversa da liga B.
   * O papel é lido por canal — se o `leftJoin` perdesse o filtro do canal, esta
   * pessoa ganhava um distintivo de "Equipa" num evento onde não é ninguém.
   */
  it("não dá distintivo a quem tem papel NOUTRO canal", async () => {
    const [canalA, canalB] = await Promise.all([criarCanal(), criarCanal()]);
    const eventoB = await criarEvento(canalB.id, { status: "live" });
    const equipaDoA = await criarUtilizador();
    await criarMembro(canalA.id, equipaDoA.id, "staff");
    // Comprou o evento da liga B como qualquer outro cliente.
    await criarEntitlement(equipaDoA.id, eventoB.id, { status: "active" });

    const acesso = await abrir(await comoUtilizador(equipaDoA), eventoB.id);
    await postMessage(acesso, "boa noite");
    const leitura = await chatSnapshot(acesso);

    expect(leitura.messages[0].authorRole).toBeNull();
  });

  it("marca as mensagens da live e separa-as dos comentários do VOD", async () => {
    const canal = await criarCanal();
    const eventoLive = await criarEvento(canal.id, { status: "live" });
    const dono = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");

    const naLive = await abrir(await comoUtilizador(dono), eventoLive.id);
    await postMessage(naLive, "durante a transmissão");

    // O evento acaba. A mesma tabela ganha a segunda vida.
    await criarMensagem(eventoLive.id, dono.id, { body: "já depois", duringLive: false });

    const leitura = await chatSnapshot(naLive);
    const corpos = new Map(leitura.messages.map((m) => [m.body, m.duringLive]));

    expect(corpos.get("durante a transmissão")).toBe(true);
    expect(corpos.get("já depois")).toBe(false);
  });

  it("recusa escrever quando a conversa está fechada", async () => {
    const canal = await criarCanal();
    const rascunho = await criarEvento(canal.id, { status: "draft" });
    const dono = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");

    const acesso = await abrir(await comoUtilizador(dono), rascunho.id);
    const resultado = await postMessage(acesso, "cedo demais");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(409);
  });

  /*
   * O CURSOR. Duas mensagens no MESMO carimbo — que numa batalha com 150
   * pessoas acontece — não podem fazer o polling saltar nenhuma delas. É por
   * isto que o cursor é o par `(created_at, id)` e não só o carimbo.
   */
  it("não salta mensagens gravadas no mesmo instante", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const dono = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");

    const instante = new Date();
    await Promise.all([
      criarMensagem(evento.id, dono.id, { body: "um", createdAt: instante }),
      criarMensagem(evento.id, dono.id, { body: "dois", createdAt: instante }),
      criarMensagem(evento.id, dono.id, { body: "três", createdAt: instante }),
    ]);

    const acesso = await abrir(await comoUtilizador(dono), evento.id);

    // Primeira leitura: traz as três, nenhuma perdida pelo carimbo repetido.
    const primeira = await chatSnapshot(acesso);
    expect(primeira.messages).toHaveLength(3);
    expect(primeira.messages.map((m) => m.body).sort()).toEqual(["dois", "três", "um"]);

    // Segunda leitura, a partir do cursor: não repete nem inventa nenhuma.
    const segunda = await chatSnapshot(acesso, { cursor: primeira.cursor });
    expect(segunda.messages).toHaveLength(0);

    /*
     * E a partir do cursor da PRIMEIRA das três, vêm exactamente as outras
     * duas: nem zero (o que `>` só sobre o carimbo dava — as três teriam o
     * mesmo e ficavam todas de fora), nem as três (o que `>=` dava, repetindo).
     *
     * A comparação é por id e não pelo corpo: com o carimbo empatado o desempate
     * é o id, que é aleatório, por isso "qual delas vem primeiro" não é uma
     * propriedade do código — o que é propriedade do código é vir cada uma
     * exactamente uma vez.
     */
    const doMeio = await chatSnapshot(acesso, {
      cursor: `${primeira.messages[0].createdAt}|${primeira.messages[0].id}`,
    });
    expect(doMeio.messages.map((m) => m.id)).toEqual([
      primeira.messages[1].id,
      primeira.messages[2].id,
    ]);
  });

  it("o `carregar mais` do arquivo traz as anteriores, sem repetir", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "ended" });
    const dono = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");

    const base = Date.now();
    for (let i = 0; i < 4; i += 1) {
      await criarMensagem(evento.id, dono.id, {
        body: `m${i}`,
        createdAt: new Date(base + i * 1000),
      });
    }

    const acesso = await abrir(await comoUtilizador(dono), evento.id);
    const leitura = await chatSnapshot(acesso);
    const maisAntiga = leitura.messages[0];

    const anteriores = await olderMessages(acesso, `${maisAntiga.createdAt}|${maisAntiga.id}`);

    // A mais antiga de todas já estava no ecrã: antes dela não há nada.
    expect(anteriores.messages).toHaveLength(0);
  });
});

describe.skipIf(!temBaseDeDados())("moderação", () => {
  beforeEach(limparBase);

  it("apaga em soft-delete: a mensagem sai do ecrã, a linha fica", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const dono = await criarUtilizador();
    const cliente = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");
    await criarEntitlement(cliente.id, evento.id, { status: "active" });

    const acessoCliente = await abrir(await comoUtilizador(cliente), evento.id);
    const escrita = await postMessage(acessoCliente, "isto vai ser apagado");
    if (!escrita.ok) throw new Error("a escrita falhou");

    const acessoDono = await abrir(await comoUtilizador(dono), evento.id);
    expect(await deleteMessage(acessoDono, escrita.message.id)).toEqual({ ok: true });

    // Fora do ecrã…
    const leitura = await chatSnapshot(acessoCliente);
    expect(leitura.messages).toHaveLength(0);

    // …mas a linha continua lá, com quem apagou e quando. É a auditoria.
    const [linha] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, escrita.message.id));

    expect(linha).toBeDefined();
    expect(linha.body).toBe("isto vai ser apagado");
    expect(linha.deletedAt).not.toBeNull();
    expect(linha.deletedBy).toBe(dono.id);
  });

  it("avisa as pessoas que já tinham a mensagem no ecrã", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const dono = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");

    const acesso = await abrir(await comoUtilizador(dono), evento.id);
    const escrita = await postMessage(acesso, "vai desaparecer");
    if (!escrita.ok) throw new Error("a escrita falhou");

    const antes = await chatSnapshot(acesso);
    await deleteMessage(acesso, escrita.message.id);

    // O poll seguinte leva o id apagado — sem isto, a mensagem ficava no ecrã
    // de toda a gente que já a tinha recebido e a moderação não se via.
    const depois = await chatSnapshot(acesso, { cursor: antes.cursor, since: antes.since });
    expect(depois.deletedIds).toContain(escrita.message.id);
  });

  it("não deixa um cliente apagar mensagens", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const [cliente, outro] = await Promise.all([criarUtilizador(), criarUtilizador()]);
    await Promise.all([
      criarEntitlement(cliente.id, evento.id, { status: "active" }),
      criarEntitlement(outro.id, evento.id, { status: "active" }),
    ]);
    const mensagem = await criarMensagem(evento.id, outro.id);

    const acesso = await abrir(await comoUtilizador(cliente), evento.id);
    const resultado = await deleteMessage(acesso, mensagem.id);

    expect(resultado).toEqual({
      ok: false,
      error: "Não tens permissão para moderar esta conversa.",
      status: 403,
    });

    const [linha] = await db.select().from(chatMessages).where(eq(chatMessages.id, mensagem.id));
    expect(linha.deletedAt).toBeNull();
  });

  /*
   * ══════════════════════════════════════════════════════════════════════════
   *  MODERAÇÃO CRUZADA ENTRE CANAIS — o teste que este ficheiro existe para ter
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O dono da liga A abre a conversa do SEU evento (o portão deixa, e bem) e
   * manda apagar o id de uma mensagem de um evento da liga B. Se o `where` do
   * `deleteMessage` não filtrasse por evento, isto passava — e passava em
   * silêncio, sem erro nenhum, exactamente o tipo de bug que não se vê a ler.
   */
  it("o dono da liga A não apaga uma mensagem da liga B", async () => {
    const [canalA, canalB] = await Promise.all([criarCanal(), criarCanal()]);
    const [eventoA, eventoB] = await Promise.all([
      criarEvento(canalA.id, { status: "live" }),
      criarEvento(canalB.id, { status: "live" }),
    ]);
    const donoDoA = await criarUtilizador();
    const clienteDoB = await criarUtilizador();
    await criarMembro(canalA.id, donoDoA.id, "owner");
    const mensagemDoB = await criarMensagem(eventoB.id, clienteDoB.id, { body: "da outra liga" });

    // Abre a conversa do evento DELE — isto é legítimo.
    const acessoNoSeuEvento = await abrir(await comoUtilizador(donoDoA), eventoA.id);
    // E aponta a um id da liga do lado.
    const resultado = await deleteMessage(acessoNoSeuEvento, mensagemDoB.id);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(404);

    // A prova que interessa: a mensagem da liga B continua viva.
    const [linha] = await db.select().from(chatMessages).where(eq(chatMessages.id, mensagemDoB.id));
    expect(linha.deletedAt).toBeNull();
  });

  it("silenciar num evento não silencia noutro", async () => {
    const canal = await criarCanal();
    const [evento1, evento2] = await Promise.all([
      criarEvento(canal.id, { status: "live" }),
      criarEvento(canal.id, { status: "live" }),
    ]);
    const dono = await criarUtilizador();
    const barulhento = await criarUtilizador();
    await criarMembro(canal.id, dono.id, "owner");
    await Promise.all([
      criarEntitlement(barulhento.id, evento1.id, { status: "active" }),
      criarEntitlement(barulhento.id, evento2.id, { status: "active" }),
    ]);

    const acessoDono = await abrir(await comoUtilizador(dono), evento1.id);
    expect(await muteUser(acessoDono, barulhento.id)).toEqual({ ok: true });

    // Calado no evento 1…
    const no1 = await abrir(await comoUtilizador(barulhento), evento1.id);
    expect((await chatSnapshot(no1)).canWrite).toBe(false);
    const tentativa = await postMessage(no1, "deixem-me falar");
    expect(tentativa.ok).toBe(false);

    // …e a falar à vontade no evento 2. O castigo fica onde a coisa aconteceu.
    const no2 = await abrir(await comoUtilizador(barulhento), evento2.id);
    expect((await chatSnapshot(no2)).canWrite).toBe(true);
    expect((await postMessage(no2, "aqui posso")).ok).toBe(true);
  });

  it("não deixa silenciar quem também opera o canal, nem a si próprio", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const [dono, equipa] = await Promise.all([criarUtilizador(), criarUtilizador()]);
    await criarMembro(canal.id, dono.id, "owner");
    await criarMembro(canal.id, equipa.id, "staff");

    const acessoEquipa = await abrir(await comoUtilizador(equipa), evento.id);

    // Um staff a calar o dono a meio de uma batalha: não.
    const contraODono = await muteUser(acessoEquipa, dono.id);
    expect(contraODono.ok).toBe(false);

    const contraSiProprio = await muteUser(acessoEquipa, equipa.id);
    expect(contraSiProprio.ok).toBe(false);
  });

  it("um cliente não silencia ninguém", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { status: "live" });
    const [cliente, outro] = await Promise.all([criarUtilizador(), criarUtilizador()]);
    await criarEntitlement(cliente.id, evento.id, { status: "active" });

    const acesso = await abrir(await comoUtilizador(cliente), evento.id);
    const resultado = await muteUser(acesso, outro.id);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(403);

    const silenciados = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.eventId, evento.id), eq(chatMessages.userId, outro.id)));
    expect(silenciados).toHaveLength(0);
  });
});
