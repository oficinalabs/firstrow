import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmPaid } from "@/lib/eupago";

/*
 * ============================================================================
 *  confirmPaid — a pergunta que impede um webhook forjado de dar acesso
 * ============================================================================
 *
 * O webhook 1.0 da Eupago chega SEM assinatura. A única coisa que separa uma
 * notificação verdadeira de uma inventada por quem descobriu o URL é esta
 * função: ela pergunta à Eupago, com a nossa chave, se a referência está mesmo
 * paga.
 *
 * PORQUE É QUE ESTE FICHEIRO EXISTE
 *
 * Esta função já apontou para um endpoint que não existe. O código estava
 * escrito, tinha um comentário a dizer que validava o pagamento, e em produção
 * teria recusado TODAS as compras — cada 404 caía no ramo do erro. Ninguém
 * daria por isso a ler: só se vê a fazer o pedido e olhar para onde ele vai.
 *
 * Por isso o primeiro teste aqui não olha para o valor devolvido: olha para o
 * URL, para o método e para onde vai a chave. São as três armadilhas que o
 * comentário de `lib/eupago.ts` documenta, e é isso que um refactor pode
 * desfazer sem que mais nada acuse.
 *
 * As respostas usadas são as formas reais do sandbox, incluindo o detalhe que
 * ninguém adivinha: o estado pago escreve-se **"paga"**, não "pago".
 */

const ENDPOINT_ESPERADO = "https://sandbox.eupago.pt/clientes/rest_api/multibanco/info";

type Chamada = { url: string; init: RequestInit };

/** Substitui o `fetch` global e guarda o que lhe foi pedido. */
function fetchGravado(resposta: { ok: boolean; status?: number; corpo?: unknown }): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), init });
    return {
      ok: resposta.ok,
      status: resposta.status ?? (resposta.ok ? 200 : 500),
      json: async () => resposta.corpo ?? {},
      text: async () => JSON.stringify(resposta.corpo ?? {}),
    } as unknown as Response;
  });
  return chamadas;
}

function fetchQueRebenta(): void {
  vi.stubGlobal("fetch", async () => {
    throw new Error("getaddrinfo ENOTFOUND sandbox.eupago.pt");
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.EUPAGO_ENV = "sandbox";
});

describe("confirmPaid — o pedido que sai", () => {
  /*
   * O teste de regressão do endpoint. Se alguém "arrumar" isto para o
   * `/api/v1*` do resto da integração — que é o palpite natural — este teste
   * cai. Foi esse palpite que pôs a função a apontar para um 404.
   */
  it("pergunta ao REST antigo em /clientes/rest_api/multibanco/info", async () => {
    const chamadas = fetchGravado({ ok: true, corpo: { estado_referencia: "paga" } });

    await confirmPaid("123456789");

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe(ENDPOINT_ESPERADO);
    expect(chamadas[0].init.method).toBe("POST");
  });

  /*
   * A chave vai no CORPO, no campo `chave` — este endpoint não lê o header
   * `Authorization` que todos os outros usam. Mandá-la no header devolvia
   * "não autorizado" e, com a falha fechada de produção, nenhuma compra
   * chegava a ser confirmada.
   */
  it("manda a chave no corpo e não no header Authorization", async () => {
    const chamadas = fetchGravado({ ok: true, corpo: { estado_referencia: "paga" } });

    await confirmPaid("123456789");

    const corpo = JSON.parse(String(chamadas[0].init.body));
    expect(corpo).toEqual({ chave: process.env.EUPAGO_API_KEY, referencia: "123456789" });
    expect(chamadas[0].init.headers).not.toHaveProperty("Authorization");
  });

  it("usa o host de produção quando EUPAGO_ENV=production", async () => {
    process.env.EUPAGO_ENV = "production";
    const chamadas = fetchGravado({ ok: true, corpo: { estado_referencia: "paga" } });

    await confirmPaid("123456789");

    expect(chamadas[0].url).toBe("https://clientes.eupago.pt/clientes/rest_api/multibanco/info");
  });
});

describe("confirmPaid — a leitura da resposta", () => {
  /*
   * "paga", não "pago". Procurar por "pago" nunca correspondia e a função dava
   * sempre não-pago, em silêncio, sem ninguém perceber porquê.
   */
  it('aceita estado_referencia "paga"', async () => {
    fetchGravado({ ok: true, corpo: { estado_referencia: "paga", sucesso: true } });

    await expect(confirmPaid("123456789")).resolves.toBe(true);
  });

  it("aceita maiúsculas no estado", async () => {
    fetchGravado({ ok: true, corpo: { estado_referencia: "PAGA" } });

    await expect(confirmPaid("123456789")).resolves.toBe(true);
  });

  it("aceita a corroboração pela lista de pagamentos", async () => {
    fetchGravado({ ok: true, corpo: { pagamentos: [{ estado: "paga" }] } });

    await expect(confirmPaid("123456789")).resolves.toBe(true);
  });

  it.each(["pendente", "expirada", "cancelada", ""])(
    'recusa uma referência com estado "%s"',
    async (estado) => {
      fetchGravado({ ok: true, corpo: { estado_referencia: estado } });

      await expect(confirmPaid("123456789")).resolves.toBe(false);
    },
  );

  /*
   * `estado: 0` na resposta NÃO quer dizer pago — é o código de "o pedido
   * correu bem". Confundir os dois dava acesso a quem não pagou.
   */
  it("não confunde o código de sucesso do pedido com o estado do pagamento", async () => {
    fetchGravado({ ok: true, corpo: { estado: 0, sucesso: true, estado_referencia: "pendente" } });

    await expect(confirmPaid("123456789")).resolves.toBe(false);
  });
});

/*
 * ────────────────────────────────────────────────────────────────────────────
 *  QUANDO NÃO SE CONSEGUE PERGUNTAR
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A postura é diferente por ambiente, de propósito, e os dois lados têm de
 * ficar presos:
 *
 *   produção — falha FECHADA. Não conseguir confirmar não pode dar acesso;
 *              seria a porta aberta para a notificação forjada.
 *   sandbox  — falha ABERTA, senão era impossível testar a cadeia toda antes
 *              de a Eupago responder.
 *
 * Se alguém trocar isto por engano, produção passa a emitir bilhetes sempre
 * que a Eupago estiver indisponível. Daí os dois ramos estarem aqui.
 */
describe("confirmPaid — falha fechada em produção", () => {
  const avarias: [string, () => void][] = [
    ["a Eupago responde com erro", () => fetchGravado({ ok: false, status: 500 })],
    ["a Eupago está inacessível", fetchQueRebenta],
  ];

  it.each(avarias)("recusa em produção quando %s", async (_nome, avariar) => {
    process.env.EUPAGO_ENV = "production";
    avariar();

    await expect(confirmPaid("123456789")).resolves.toBe(false);
  });

  it.each(avarias)("deixa passar em sandbox quando %s", async (_nome, avariar) => {
    process.env.EUPAGO_ENV = "sandbox";
    avariar();

    await expect(confirmPaid("123456789")).resolves.toBe(true);
  });

  it("recusa em produção uma notificação sem referência", async () => {
    process.env.EUPAGO_ENV = "production";
    const chamadas = fetchGravado({ ok: true, corpo: { estado_referencia: "paga" } });

    await expect(confirmPaid("")).resolves.toBe(false);
    // Nem sequer chega a perguntar — não há o que perguntar.
    expect(chamadas).toHaveLength(0);
  });
});
