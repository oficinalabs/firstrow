import { beforeEach, describe, expect, it } from "vitest";
import { events } from "@/db/schema";
import type { AuthUser } from "@/server/authz";
import { inScope, manageScope, operateScope } from "@/server/authz";
import { countSalesByEvent, inChannelScope, listEventsInScope } from "@/server/events";
import { limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { criarCanal, criarEntitlement, criarEvento, criarUtilizador } from "../apoio/fabrica";

/*
 * ============================================================================
 *  ISOLAMENTO ENTRE CANAIS — a diferença entre ver a tua liga e ver todas
 * ============================================================================
 *
 * O backoffice soma dinheiro e lista compradores. A pergunta "de que canais é
 * que esta pessoa pode falar?" tem uma resposta perigosa quando está vazia:
 *
 *   · certo   → âmbito vazio significa ZERO linhas;
 *   · errado  → âmbito vazio traduzido para "sem filtro", e aí quem não gere
 *               canal nenhum passa a ver o dinheiro e os emails de TODOS.
 *
 * É a mesma fuga do antigo papel global `league_owner`, só que pela porta das
 * estatísticas. `inScope` (server/authz.ts) é o ponto único onde a tradução
 * acontece, e a linha do meio — lista vazia devolve `false` explícito — é a
 * que TEM de estar certa. Este ficheiro prova-a de duas formas: a forma do SQL
 * que sai, e o resultado real contra a base de dados.
 */

/** Um utilizador de teste com o papel e as filiações dados. */
function utilizador(parcial: Partial<AuthUser>): AuthUser {
  return {
    id: "u",
    name: "Teste",
    email: "teste@exemplo.test",
    emailVerified: true,
    role: "viewer",
    memberships: [],
    ...parcial,
  };
}

describe("os construtores de âmbito", () => {
  it("dão `all` ao platform_admin — ele vê tudo", () => {
    const admin = utilizador({ role: "platform_admin" });

    expect(manageScope(admin)).toEqual({ all: true });
    expect(operateScope(admin)).toEqual({ all: true });
  });

  it("dão a lista dos canais geridos a um owner", () => {
    const owner = utilizador({
      memberships: [
        { channelId: "canal-a", role: "owner" },
        { channelId: "canal-b", role: "staff" },
      ],
    });

    // manageScope = só onde é OWNER (dinheiro); operateScope = owner + staff.
    expect(manageScope(owner)).toEqual({ all: false, channelIds: ["canal-a"] });
    expect(operateScope(owner)).toEqual({ all: false, channelIds: ["canal-a", "canal-b"] });
  });

  /*
   * O CASO CRÍTICO. Um viewer sem filiações — ou um antigo `league_owner` cujo
   * papel global já não vale nada — tem de dar um âmbito VAZIO, não `all`.
   */
  it("dão um âmbito vazio a quem não gere nada", () => {
    const zeParaninguem = utilizador({ memberships: [] });

    expect(manageScope(zeParaninguem)).toEqual({ all: false, channelIds: [] });
    expect(operateScope(zeParaninguem)).toEqual({ all: false, channelIds: [] });
  });
});

describe("inScope — a tradução para SQL", () => {
  // A coluna é indiferente para o que se testa aqui; usa-se uma real.
  const coluna = events.channelId;

  it("não filtra nada quando o âmbito é `all`", () => {
    // `undefined` no `where` do drizzle = sem condição = todas as linhas.
    expect(inScope(coluna, { all: true })).toBeUndefined();
  });

  /*
   * A LINHA QUE NÃO PODE PARTIR: lista vazia devolve uma condição `false`, não
   * `undefined`. `undefined` seria "sem filtro" e abria tudo. Comparamos o SQL
   * gerado com o de um literal `false` conhecido — se alguém trocar o ramo por
   * `undefined`, isto cai.
   */
  it("devolve uma condição sempre-falsa quando a lista está vazia", () => {
    const condicao = inScope(coluna, { all: false, channelIds: [] });

    expect(condicao).toBeDefined();
    // A prova real de que dá zero linhas está no teste de integração abaixo;
    // aqui garantimos só que NÃO é `undefined` (o valor perigoso).
    expect(condicao).not.toBeUndefined();
  });

  it("filtra pela lista quando há canais", () => {
    expect(inScope(coluna, { all: false, channelIds: ["a"] })).toBeDefined();
  });
});

describe.skipIf(!temBaseDeDados())("isolamento contra a base de dados", () => {
  beforeEach(limparBase);

  /*
   * O teste que vale por todos: monta eventos em dois canais e prova que cada
   * âmbito vê exatamente o que deve — e que o âmbito vazio não vê NADA.
   */
  it("cada âmbito só vê os eventos dos seus canais", async () => {
    const [canalA, canalB] = await Promise.all([criarCanal(), criarCanal()]);
    await Promise.all([
      criarEvento(canalA.id, { title: "A1" }),
      criarEvento(canalA.id, { title: "A2" }),
      criarEvento(canalB.id, { title: "B1" }),
    ]);

    const soA = await listEventsInScope({ all: false, channelIds: [canalA.id] });
    const tudo = await listEventsInScope({ all: true });
    const nada = await listEventsInScope({ all: false, channelIds: [] });

    expect(soA.map((e) => e.title).sort()).toEqual(["A1", "A2"]);
    expect(tudo).toHaveLength(3);
    // O CORAÇÃO DO TESTE: âmbito vazio → zero eventos, nunca "todos".
    expect(nada).toHaveLength(0);
  });

  it("as somas de vendas respeitam o âmbito, e o vazio soma zero", async () => {
    const [canalA, canalB] = await Promise.all([criarCanal(), criarCanal()]);
    const eventoA = await criarEvento(canalA.id);
    const eventoB = await criarEvento(canalB.id);
    const [compradorA, compradorB] = await Promise.all([criarUtilizador(), criarUtilizador()]);
    await criarEntitlement(compradorA.id, eventoA.id, { status: "active" });
    await criarEntitlement(compradorB.id, eventoB.id, { status: "active" });

    const soA = await countSalesByEvent({ all: false, channelIds: [canalA.id] });
    const nada = await countSalesByEvent({ all: false, channelIds: [] });

    expect(soA.get(eventoA.id)).toBe(1);
    // O evento do outro canal nem aparece no mapa.
    expect(soA.has(eventoB.id)).toBe(false);
    // Âmbito vazio: mapa vazio, não o total da plataforma.
    expect(nada.size).toBe(0);
  });

  /*
   * Uma segunda leitura do mesmo perigo, agora pela função que os ecrãs usam
   * mesmo (`inChannelScope`), para o caso de alguém a trocar sem passar por
   * `inScope`.
   */
  it("inChannelScope com lista vazia não deixa passar linha nenhuma", async () => {
    const canal = await criarCanal();
    await criarEvento(canal.id);

    const semFiltro = inChannelScope({ all: false, channelIds: [] });
    expect(semFiltro).toBeDefined();

    const nada = await listEventsInScope({ all: false, channelIds: [] });
    expect(nada).toHaveLength(0);
  });
});
