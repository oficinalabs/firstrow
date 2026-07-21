import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * ============================================================================
 *  A LIMPEZA DE IMAGENS ÓRFÃS — e as três formas de ela correr mal
 * ============================================================================
 *
 * Esta é a única rotina do projeto que APAGA ficheiros do bucket real do dono,
 * sozinha, todas as noites. O que se testa aqui não é sobretudo "apaga o lixo"
 * — é "NÃO apaga o que não é lixo", que é o modo de falha que custa dinheiro e
 * não tem desfazer.
 *
 * As três armadilhas, cada uma com o seu teste:
 *
 *  1. `canais/_novo/<userId>/…` PARECE lixo (o prefixo diz "novo") e pode estar
 *     VIVO: um canal criado por esse ecrã guarda esse URL para sempre. Uma
 *     limpeza por prefixo apagava logos de canais em produção.
 *  2. Um objeto acabado de carregar ainda NÃO é órfão — o formulário pode estar
 *     aberto noutro separador. Sem prazo de graça, a limpeza apagava a imagem
 *     por baixo de quem a estava a escolher.
 *  3. Uma leitura falhada do bucket, ou uma base sem referências, fazem TUDO
 *     parecer órfão. É aqui que uma limpeza se transforma num apagar geral.
 *
 * O R2 é sempre falso nestes testes: nenhuma asserção pode depender de rede, e
 * muito menos escrever no bucket a sério.
 */

const BUCKET_PUBLICO = "https://imagens.exemplo.test";

process.env.R2_ACCOUNT_ID ||= "conta-de-teste";
process.env.R2_ACCESS_KEY_ID ||= "chave-de-teste";
process.env.R2_SECRET_ACCESS_KEY ||= "segredo-de-teste";
process.env.R2_BUCKET ||= "balde-de-teste";
process.env.R2_PUBLIC_URL = BUCKET_PUBLICO;

type ObjetoFalso = { key: string; lastModified: Date; bytes: number };

let objetosNoBucket: ObjetoFalso[] | null = [];
const apagados: string[] = [];

const listImagesMock = vi.fn(async () => objetosNoBucket);
const deleteImageMock = vi.fn(async (key: string) => {
  apagados.push(key);
  return true;
});

vi.mock("@/lib/r2", async (original) => ({
  ...(await original<typeof import("@/lib/r2")>()),
  listImages: listImagesMock,
  deleteImage: deleteImageMock,
}));

const { limparImagensOrfas, PRAZO_DE_GRACA_MS } = await import("@/server/imagens-orfas");
const { limparBase, temBaseDeDados } = await import("../apoio/base-de-dados");
const { criarCanal } = await import("../apoio/fabrica");

const AGORA = new Date("2026-07-21T12:00:00Z");
/** Bem para lá do prazo de graça — é lixo a sério. */
const VELHO = new Date(AGORA.getTime() - PRAZO_DE_GRACA_MS - 60_000);
/** Ainda dentro do prazo — pode ser um formulário aberto. */
const RECENTE = new Date(AGORA.getTime() - 60_000);

function objeto(key: string, lastModified: Date, bytes = 1024): ObjetoFalso {
  return { key, lastModified, bytes };
}

describe.skipIf(!temBaseDeDados())("limpeza de imagens órfãs", () => {
  beforeEach(async () => {
    await limparBase();
    objetosNoBucket = [];
    apagados.length = 0;
    listImagesMock.mockClear();
    deleteImageMock.mockClear();
  });

  it("apaga o que ninguém refere e já passou o prazo de graça", async () => {
    objetosNoBucket = [objeto("canais/_novo/utilizador-1/logo-abandonado.webp", VELHO)];
    // Um canal com imagem, para a guarda das referências não disparar.
    await criarCanal({ logoUrl: `${BUCKET_PUBLICO}/canais/canal-1/logo-vivo.webp` });
    objetosNoBucket.push(objeto("canais/canal-1/logo-vivo.webp", VELHO));

    const r = await limparImagensOrfas({ dryRun: false, agora: AGORA });

    expect(r.abortadoPorque).toBeUndefined();
    expect(apagados).toEqual(["canais/_novo/utilizador-1/logo-abandonado.webp"]);
    expect(r.apagadas).toBe(1);
  });

  /*
   * ⚠️ O TESTE QUE JUSTIFICA O CRITÉRIO SER POR REFERÊNCIA E NÃO POR PREFIXO.
   * Se alguém "simplificar" isto para apagar tudo o que está sob `_novo/`, é
   * este que fica vermelho — e o que ele descreve é uma imagem partida no site
   * público de uma liga a pagar.
   */
  it("NÃO apaga uma imagem sob `_novo/` que um canal vivo ainda refere", async () => {
    const chaveViva = "canais/_novo/utilizador-1/logo-do-canal-que-nasceu.webp";
    await criarCanal({ logoUrl: `${BUCKET_PUBLICO}/${chaveViva}` });
    objetosNoBucket = [objeto(chaveViva, VELHO)];

    const r = await limparImagensOrfas({ dryRun: false, agora: AGORA });

    expect(apagados).toEqual([]);
    expect(r.referidas).toBe(1);
    expect(r.orfas).toHaveLength(0);
  });

  it("NÃO apaga o que foi carregado há pouco, mesmo sem referência", async () => {
    await criarCanal({ logoUrl: `${BUCKET_PUBLICO}/canais/canal-1/logo.webp` });
    objetosNoBucket = [
      objeto("canais/canal-1/logo.webp", VELHO),
      objeto("canais/_novo/utilizador-1/acabada-de-carregar.webp", RECENTE),
    ];

    const r = await limparImagensOrfas({ dryRun: false, agora: AGORA });

    expect(apagados).toEqual([]);
    expect(r.recentes).toBe(1);
  });

  it("também protege o banner, e não só o logo", async () => {
    const banner = "canais/canal-1/banner-vivo.webp";
    await criarCanal({ bannerUrl: `${BUCKET_PUBLICO}/${banner}` });
    objetosNoBucket = [objeto(banner, VELHO)];

    await limparImagensOrfas({ dryRun: false, agora: AGORA });

    expect(apagados).toEqual([]);
  });

  // ── As guardas ────────────────────────────────────────────────────────────

  it("aborta sem apagar nada quando não consegue ler o bucket", async () => {
    // `null` (e não lista vazia) é como `listImages` diz "não consegui ler".
    objetosNoBucket = null;

    const r = await limparImagensOrfas({ dryRun: false, agora: AGORA });

    expect(r.abortadoPorque).toContain("listar");
    expect(apagados).toEqual([]);
    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  /*
   * O acidente caro: bucket cheio + base a não referir nada. O mais provável não
   * é estar tudo órfão — é a query ter corrido contra a base errada. Mesma
   * lição do `inChannelScope()`: vazio significa zero, nunca "sem filtro".
   */
  it("aborta quando o bucket tem objetos e a base não refere nenhum", async () => {
    objetosNoBucket = [
      objeto("canais/canal-1/logo.webp", VELHO),
      objeto("canais/canal-2/banner.webp", VELHO),
    ];
    // Nenhum canal criado: `chavesReferidas()` devolve conjunto vazio.

    const r = await limparImagensOrfas({ dryRun: false, agora: AGORA });

    expect(r.abortadoPorque).toBeDefined();
    expect(apagados).toEqual([]);
  });

  it("por omissão não apaga — só relata", async () => {
    await criarCanal({ logoUrl: `${BUCKET_PUBLICO}/canais/canal-1/logo.webp` });
    objetosNoBucket = [
      objeto("canais/canal-1/logo.webp", VELHO),
      objeto("canais/_novo/utilizador-1/lixo.webp", VELHO, 2048),
    ];

    const r = await limparImagensOrfas({ agora: AGORA });

    expect(apagados).toEqual([]);
    expect(r.apagadas).toBe(0);
    expect(r.orfas.map((o) => o.key)).toEqual(["canais/_novo/utilizador-1/lixo.webp"]);
    expect(r.bytesOrfaos).toBe(2048);
  });

  /*
   * Os logos que vêm no repositório são guardados como caminho interno
   * (`/imagens/…`), não como URL do bucket. Não podem ser confundidos com uma
   * chave, nem contar como referência a coisa nenhuma.
   */
  it("ignora canais cuja imagem é um caminho interno do repositório", async () => {
    await criarCanal({ logoUrl: "/imagens/smokingbars.svg" });
    await criarCanal({ logoUrl: `${BUCKET_PUBLICO}/canais/canal-2/logo.webp` });
    objetosNoBucket = [objeto("canais/canal-2/logo.webp", VELHO)];

    const r = await limparImagensOrfas({ dryRun: false, agora: AGORA });

    // Só o URL do bucket conta como referência; o caminho interno não.
    expect(r.referidas).toBe(1);
    expect(apagados).toEqual([]);
  });
});
