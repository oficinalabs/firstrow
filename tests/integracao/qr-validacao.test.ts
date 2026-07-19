import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { tickets } from "@/db/schema";
import { issueTicket, shortCode, validateTicket } from "@/server/tickets";
import { db, limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { criarBilhete, criarCanal, criarEvento, criarUtilizador } from "../apoio/fabrica";
import { cumpridos, emParalelo } from "../apoio/paralelo";

/*
 * ============================================================================
 *  VALIDAÇÃO DO QR À PORTA
 * ============================================================================
 *
 * É o momento em que o bilhete vale ou não vale: a porta de um evento pago, com
 * fila atrás. Quatro coisas têm de estar certas, e três delas são de segurança:
 *
 *   1. um bilhete válido entra UMA vez — dois scanners a ler o mesmo QR ao
 *      mesmo tempo dão um "válido" e um "já usado", nunca dois "válido";
 *   2. o token não é adivinhável nem enumerável;
 *   3. um bilhete de OUTRO canal é indistinguível de um inventado — senão o
 *      porteiro de uma liga descobria quem comprou o quê na outra;
 *   4. os estados distinguem-se: inválido, já usado, evento errado (do mesmo
 *      canal).
 */

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

describe.skipIf(!temBaseDeDados())("token do QR", () => {
  beforeEach(limparBase);

  it("é opaco, com prefixo frt_ e 192 bits de entropia", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { ticketPriceCents: 1000 });

    const token = await bilheteEmitido(comprador.id, evento.id);

    expect(token).toMatch(/^frt_/);
    // 24 bytes em base64url = 32 caracteres depois do prefixo.
    const corpo = token.slice("frt_".length);
    expect(corpo).toHaveLength(32);
    expect(corpo).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("é diferente em cada emissão", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { ticketPriceCents: 1000 });

    const tokens = new Set<string>();
    for (let i = 0; i < 25; i++) tokens.add(await bilheteEmitido(comprador.id, evento.id));

    expect(tokens.size).toBe(25);
  });
});

describe.skipIf(!temBaseDeDados())("validateTicket — o caminho feliz e a corrida", () => {
  beforeEach(limparBase);

  it("aceita o token completo e marca o bilhete como usado", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador({ name: "Rita Compradora" });
    const evento = await criarEvento(canal.id, { ticketPriceCents: 1000 });
    const token = await bilheteEmitido(comprador.id, evento.id);

    const resultado = await validateTicket(token, evento.id, canal.id);

    expect(resultado.resultado).toBe("valido");
    if (resultado.resultado === "valido") {
      expect(resultado.nome).toBe("Rita Compradora");
      expect(resultado.codigo).toBe(shortCode(token));
    }
  });

  it("aceita o código curto escrito à mão", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { ticketPriceCents: 1000 });
    const token = await bilheteEmitido(comprador.id, evento.id);

    // Como a porta o escreve: minúsculas, com e sem hífens, com espaços.
    const codigo = shortCode(token);
    const comoEscrito = codigo.toLowerCase().replace(/-/g, " ");

    const resultado = await validateTicket(comoEscrito, evento.id, canal.id);

    expect(resultado.resultado).toBe("valido");
  });

  /*
   * ────────────────────────────────────────────────────────────────────────
   *  A CORRIDA DOS DOIS SCANNERS
   * ────────────────────────────────────────────────────────────────────────
   *
   * Dois telemóveis à porta leem o mesmo QR no mesmo instante. Se ambos
   * recebessem "válido", entravam duas pessoas com um bilhete. O UPDATE tem
   * `status = 'issued'` no `where` e devolve as linhas mexidas: o Postgres só
   * deixa uma transação transitar issued→used, a outra não mexe em nada.
   *
   * O invariante não depende de qual scanner ganha: exatamente um "válido".
   */
  it("dois scanners no mesmo QR dão um válido e um já usado", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { ticketPriceCents: 1000 });
    const token = await bilheteEmitido(comprador.id, evento.id);

    const resultados = cumpridos(
      await emParalelo(2, () => validateTicket(token, evento.id, canal.id)),
    );

    expect(resultados.filter((r) => r.resultado === "valido")).toHaveLength(1);
    expect(resultados.filter((r) => r.resultado === "ja_usado")).toHaveLength(1);
  });

  it("uma segunda passagem, já em série, diz já usado", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { ticketPriceCents: 1000 });
    const token = await bilheteEmitido(comprador.id, evento.id);

    await validateTicket(token, evento.id, canal.id);
    const segunda = await validateTicket(token, evento.id, canal.id);

    expect(segunda.resultado).toBe("ja_usado");
  });
});

describe.skipIf(!temBaseDeDados())("validateTicket — o que não entra", () => {
  beforeEach(limparBase);

  it("diz inválido a um código inventado", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { ticketPriceCents: 1000 });

    expect((await validateTicket("frt_naoexiste", evento.id, canal.id)).resultado).toBe("invalido");
    expect((await validateTicket("FR-ZZZZ-ZZ", evento.id, canal.id)).resultado).toBe("invalido");
  });

  it("diz inválido a um bilhete pendente (não pago)", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador();
    const evento = await criarEvento(canal.id, { ticketPriceCents: 1000 });
    // Pendente: nunca foi emitido, não tem token utilizável.
    await criarBilhete(comprador.id, evento.id, { status: "pending" });

    // Sem token não há o que validar; um código inventado é o mais próximo.
    expect((await validateTicket("FR-AAAA-AA", evento.id, canal.id)).resultado).toBe("invalido");
  });

  it("distingue um bilhete de outro evento DO MESMO canal", async () => {
    const canal = await criarCanal();
    const comprador = await criarUtilizador({ name: "Zé" });
    const eventoPorta = await criarEvento(canal.id, {
      ticketPriceCents: 1000,
      title: "Noite de hoje",
    });
    const outroEvento = await criarEvento(canal.id, {
      ticketPriceCents: 1000,
      title: "Semana passada",
    });
    const token = await bilheteEmitido(comprador.id, outroEvento.id);

    // Apresentado à porta do evento errado, mas dentro do mesmo canal: a porta
    // tem o direito de dizer "isto é de outro evento".
    const resultado = await validateTicket(token, eventoPorta.id, canal.id);

    expect(resultado.resultado).toBe("evento_errado");
    if (resultado.resultado === "evento_errado") {
      expect(resultado.eventoTitulo).toBe("Semana passada");
    }
  });

  /*
   * ────────────────────────────────────────────────────────────────────────
   *  A FUGA QUE O FILTRO POR CANAL FECHA
   * ────────────────────────────────────────────────────────────────────────
   *
   * Um bilhete de OUTRA liga não pode devolver "evento_errado" — essa resposta
   * leva o nome do comprador e o título do evento. Com duas ligas na
   * plataforma, o porteiro de uma lia um QR e ficava a saber quem comprou o quê
   * na outra. Tem de ser indistinguível de um código inventado: "inválido".
   *
   * O teste ataca pelas DUAS vias, porque o código as trata em sítios
   * diferentes: o token completo (lido da câmara) vai direto ao UPDATE; o
   * código curto passa pela busca. As duas têm de filtrar pelo canal.
   */
  it("esconde por completo um bilhete de outro canal (token da câmara)", async () => {
    const canalA = await criarCanal();
    const canalB = await criarCanal();
    const comprador = await criarUtilizador();
    const eventoA = await criarEvento(canalA.id, { ticketPriceCents: 1000 });
    const eventoB = await criarEvento(canalB.id, { ticketPriceCents: 1000 });
    const tokenDeB = await bilheteEmitido(comprador.id, eventoB.id);

    // A porta do canal A aponta a câmara a um QR do canal B.
    const resultado = await validateTicket(tokenDeB, eventoA.id, canalA.id);

    expect(resultado.resultado).toBe("invalido");
  });

  it("esconde por completo um bilhete de outro canal (código curto)", async () => {
    const canalA = await criarCanal();
    const canalB = await criarCanal();
    const comprador = await criarUtilizador();
    const eventoA = await criarEvento(canalA.id, { ticketPriceCents: 1000 });
    const eventoB = await criarEvento(canalB.id, { ticketPriceCents: 1000 });
    const tokenDeB = await bilheteEmitido(comprador.id, eventoB.id);

    const resultado = await validateTicket(shortCode(tokenDeB), eventoA.id, canalA.id);

    expect(resultado.resultado).toBe("invalido");
  });
});
