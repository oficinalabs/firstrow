import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tickets } from "@/db/schema";
import type { AuthUser } from "@/server/authz";

/*
 * ============================================================================
 *  O SCANNER DA PORTA, ENTRE DUAS LIGAS
 * ============================================================================
 *
 * O `staff` da liga A não valida bilhetes da liga B. Dito assim parece óbvio;
 * o que o torna frágil é haver DOIS sítios a decidi-lo — o papel (pode operar
 * este evento?) e o bilhete (este QR é deste evento?) — e só um deles estar
 * coberto até agora. Este ficheiro cobre o primeiro, que é o que a abertura do
 * backoffice ao staff pôs em jogo.
 *
 * Porque é que isto passou a importar AGORA: até esta frente o `staff` nem
 * sequer entrava em `/admin`, por isso a pergunta "e se ele apontar o scanner
 * ao evento da liga do lado?" não tinha como ser feita. Passou a ter.
 *
 * O QUE SE MOCKA, E PORQUÊ SÓ ISSO
 * Só `getCurrentUser` — não há pedido HTTP de onde ler um cookie. Tudo o resto
 * é o código a sério: `canOperateEvents`, `inspectEvent`, `requireApiForEvent`
 * e `validateTicket`, com as filiações lidas da base de dados. Um `AuthUser`
 * com uma lista de filiações inventada provava uma cópia da regra, não a regra.
 */

const getCurrentUserMock = vi.fn<() => Promise<AuthUser | null>>();

vi.mock("@/server/authz", async (original) => ({
  ...(await original<typeof import("@/server/authz")>()),
  getCurrentUser: getCurrentUserMock,
}));

const { canOperateEvents, loadMemberships, operateScope } = await import("@/server/authz");
const { requireApiForEvent } = await import("@/server/api-guard");
const { listEventsInScope } = await import("@/server/events");
const { issueTicket, validateTicket } = await import("@/server/tickets");
const { db, limparBase, temBaseDeDados } = await import("../apoio/base-de-dados");
const { criarBilhete, criarCanal, criarEvento, criarMembro, criarUtilizador } = await import(
  "../apoio/fabrica"
);

/** Um `AuthUser` com as filiações REAIS da base — nunca uma lista inventada. */
async function comoUtilizador(conta: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}): Promise<AuthUser> {
  return {
    id: conta.id,
    name: conta.name,
    email: conta.email,
    emailVerified: conta.emailVerified,
    role: "viewer",
    memberships: await loadMemberships(conta.id),
  };
}

/** Emite um bilhete pago e devolve o token do QR já pronto a validar. */
async function bilheteEmitido(userId: string, eventId: string): Promise<string> {
  const bilhete = await criarBilhete(userId, eventId);
  await issueTicket(bilhete.id, "ref-1");
  const [linha] = await db
    .select({ qrToken: tickets.qrToken })
    .from(tickets)
    .where(eq(tickets.id, bilhete.id));
  if (!linha.qrToken) throw new Error("bilhete sem token depois de emitido");
  return linha.qrToken;
}

/**
 * Duas ligas, cada uma com a sua equipa de porta, o seu evento com bilhetes e
 * um comprador. É o cenário do mundo real: duas portas, na mesma noite.
 */
async function duasLigas() {
  const [ligaA, ligaB] = await Promise.all([criarCanal(), criarCanal()]);
  const [porteiroA, porteiroB, donoA, compradorA, compradorB] = await Promise.all([
    criarUtilizador(),
    criarUtilizador(),
    criarUtilizador(),
    criarUtilizador(),
    criarUtilizador(),
  ]);

  await Promise.all([
    criarMembro(ligaA.id, porteiroA.id, "staff"),
    criarMembro(ligaB.id, porteiroB.id, "staff"),
    criarMembro(ligaA.id, donoA.id, "owner"),
  ]);

  const [eventoA, eventoB] = await Promise.all([
    criarEvento(ligaA.id, { title: "Porta A", ticketPriceCents: 1000 }),
    criarEvento(ligaB.id, { title: "Porta B", ticketPriceCents: 1000 }),
  ]);

  return { ligaA, ligaB, porteiroA, porteiroB, donoA, compradorA, compradorB, eventoA, eventoB };
}

describe.skipIf(!temBaseDeDados())("o papel de porta é POR CANAL", () => {
  beforeEach(async () => {
    await limparBase();
    getCurrentUserMock.mockReset();
  });

  it("o porteiro da liga A opera o evento da liga A", async () => {
    const { porteiroA, eventoA } = await duasLigas();
    const user = await comoUtilizador(porteiroA);

    expect(canOperateEvents(user, eventoA.channelId)).toBe(true);
  });

  it("o porteiro da liga A NÃO opera o evento da liga B", async () => {
    const { porteiroA, eventoB } = await duasLigas();
    const user = await comoUtilizador(porteiroA);

    expect(canOperateEvents(user, eventoB.channelId)).toBe(false);
  });

  it("ser dono da liga A também não dá a porta da liga B", async () => {
    const { donoA, eventoB } = await duasLigas();
    const user = await comoUtilizador(donoA);

    expect(canOperateEvents(user, eventoB.channelId)).toBe(false);
  });
});

describe.skipIf(!temBaseDeDados())("o portão da API de validação", () => {
  beforeEach(async () => {
    await limparBase();
    getCurrentUserMock.mockReset();
  });

  it("deixa passar o porteiro no evento do seu canal", async () => {
    const { porteiroA, eventoA } = await duasLigas();
    getCurrentUserMock.mockResolvedValue(await comoUtilizador(porteiroA));

    const gate = await requireApiForEvent(eventoA.id, canOperateEvents);

    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.event.id).toBe(eventoA.id);
  });

  /*
   * O CASO QUE INTERESSA. E repara no status: **404**, não 403.
   *
   * Um 403 confirmava que o evento existe, e a partir daí o porteiro de uma
   * liga varria ids e ficava a saber quando a liga do lado tem eventos. Aqui um
   * evento de outro canal é indistinguível de um id inventado — é a regra da
   * casa (docs/SEGURANCA-APP.md) e o teste abaixo prova que as duas respostas
   * são mesmo iguais.
   */
  it("responde 404 ao porteiro que aponta ao evento da outra liga", async () => {
    const { porteiroA, eventoB } = await duasLigas();
    getCurrentUserMock.mockResolvedValue(await comoUtilizador(porteiroA));

    const gate = await requireApiForEvent(eventoB.id, canOperateEvents);

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(404);
  });

  it("um evento de outra liga e um id inventado dão a MESMA resposta", async () => {
    const { porteiroA, eventoB } = await duasLigas();
    getCurrentUserMock.mockResolvedValue(await comoUtilizador(porteiroA));

    const alheio = await requireApiForEvent(eventoB.id, canOperateEvents);
    const inventado = await requireApiForEvent("evt_nao_existe", canOperateEvents);

    expect(alheio.ok).toBe(false);
    expect(inventado.ok).toBe(false);
    if (!alheio.ok && !inventado.ok) {
      expect(alheio.response.status).toBe(inventado.response.status);
      expect(await alheio.response.json()).toEqual(await inventado.response.json());
    }
  });

  it("sem sessão dá 401, e não 404", async () => {
    const { eventoA } = await duasLigas();
    getCurrentUserMock.mockResolvedValue(null);

    const gate = await requireApiForEvent(eventoA.id, canOperateEvents);

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("um espectador sem filiações não passa em porta nenhuma", async () => {
    const { compradorA, eventoA } = await duasLigas();
    getCurrentUserMock.mockResolvedValue(await comoUtilizador(compradorA));

    const gate = await requireApiForEvent(eventoA.id, canOperateEvents);

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(404);
  });
});

describe.skipIf(!temBaseDeDados())("o seletor de eventos do scanner", () => {
  beforeEach(async () => {
    await limparBase();
    getCurrentUserMock.mockReset();
  });

  /*
   * O ecrã que o porteiro vê ao abrir `/admin/scanner` sem evento escolhido.
   * Se a lista trouxesse os eventos da outra liga, o isolamento morria antes de
   * alguém chegar a apontar a câmara a nada.
   */
  it("só mostra os eventos do canal onde a pessoa é equipa", async () => {
    const { porteiroA, eventoA } = await duasLigas();
    const user = await comoUtilizador(porteiroA);

    const lista = await listEventsInScope(operateScope(user));

    expect(lista.map((e) => e.id)).toEqual([eventoA.id]);
  });

  it("a quem não é membro de nada mostra uma lista vazia, não todas", async () => {
    const { compradorA } = await duasLigas();
    const user = await comoUtilizador(compradorA);

    const lista = await listEventsInScope(operateScope(user));

    expect(lista).toHaveLength(0);
  });
});

describe.skipIf(!temBaseDeDados())("de ponta a ponta: o QR da outra liga à porta", () => {
  beforeEach(async () => {
    await limparBase();
    getCurrentUserMock.mockReset();
  });

  /*
   * As duas defesas juntas, na ordem em que a rota as usa: primeiro o portão do
   * evento (papel no canal), depois a validação do bilhete (o QR é deste
   * evento?). Basta uma para o bilhete da liga B não entrar pela porta da A —
   * e ter as duas é o que faz com que arrancar uma não abra o buraco.
   */
  it("o porteiro da A não consegue queimar um bilhete da B, e o bilhete fica intacto", async () => {
    const { porteiroA, compradorB, eventoA, eventoB } = await duasLigas();
    const tokenDaB = await bilheteEmitido(compradorB.id, eventoB.id);
    getCurrentUserMock.mockResolvedValue(await comoUtilizador(porteiroA));

    // 1ª defesa: apontar ao evento da outra liga nem passa do portão.
    const pelaPortaDaB = await requireApiForEvent(eventoB.id, canOperateEvents);
    expect(pelaPortaDaB.ok).toBe(false);

    // 2ª defesa: mesmo lendo o QR da liga B na porta da liga A (que ele pode
    // operar), o bilhete não é deste evento e não vale.
    const naPortaDaA = await validateTicket(tokenDaB, eventoA.id, eventoA.channelId);
    // "invalido" e não "outro-evento": um bilhete de OUTRO canal tem de ser
    // indistinguível de um código inventado, senão a porta da liga A confirmava
    // que aquele QR é um bilhete a sério nalgum lado.
    expect(naPortaDaA.resultado).toBe("invalido");

    // E o mais importante: o bilhete da liga B continua por usar. Um "inválido"
    // que gastasse o bilhete deixava o comprador dela à porta na noite dele.
    const [linha] = await db
      .select({ status: tickets.status, usedAt: tickets.usedAt })
      .from(tickets)
      .where(eq(tickets.qrToken, tokenDaB));
    expect(linha.status).not.toBe("used");
    expect(linha.usedAt).toBeNull();
  });

  it("na porta certa, o mesmo bilhete entra", async () => {
    const { porteiroB, compradorB, eventoB } = await duasLigas();
    const tokenDaB = await bilheteEmitido(compradorB.id, eventoB.id);
    getCurrentUserMock.mockResolvedValue(await comoUtilizador(porteiroB));

    const gate = await requireApiForEvent(eventoB.id, canOperateEvents);
    expect(gate.ok).toBe(true);

    const resultado = await validateTicket(tokenDaB, eventoB.id, eventoB.channelId);
    expect(resultado.resultado).toBe("valido");
  });
});
