import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/server/authz";

/*
 * ============================================================================
 *  UPLOAD DE IMAGENS DE CANAL — quem pode, e o que passa
 * ============================================================================
 *
 * Duas perguntas, e as duas se respondem contra a ROTA a sério, com as
 * filiações lidas da base de dados:
 *
 *  1. **Quem pode.** Dono do canal e `platform_admin`. O `staff` NÃO. E os
 *     papéis são POR CANAL: o dono da liga A não carrega imagens na liga B.
 *  2. **O que passa.** Um `.png` que é outra coisa, um SVG, medidas erradas,
 *     peso a mais, um `kind` inventado. Nada disto vem do formulário — vem de
 *     pedidos feitos à mão, que é como um atacante os faz.
 *
 * O QUE SE MOCKA, E PORQUÊ SÓ ISSO
 * `getCurrentUser` (não há pedido HTTP de onde ler um cookie) e a ESCRITA no
 * R2 (um teste não tem o direito de sujar o bucket do cliente, nem de precisar
 * de rede para correr em CI). Tudo o resto é o código a sério: `inspectChannel`,
 * `canManageEvents`, as magic bytes, o `sharp`, os status. Um `AuthUser` com
 * filiações inventadas provava uma cópia da regra, não a regra.
 *
 * O caminho completo — chaves a sério, bytes no bucket, imagem na página do
 * canal — está medido à parte e vai no relatório. Aqui é a lógica.
 */

const getCurrentUserMock = vi.fn<() => Promise<AuthUser | null>>();

vi.mock("@/server/authz", async (original) => ({
  ...(await original<typeof import("@/server/authz")>()),
  getCurrentUser: getCurrentUserMock,
}));

/** O bucket de mentira deste ficheiro. `r2Config()` lê-o do ambiente. */
const BUCKET_PUBLICO = "https://pub-exemplo.r2.dev";
process.env.R2_ACCOUNT_ID ||= "conta-de-teste";
process.env.R2_ACCESS_KEY_ID ||= "chave-de-teste";
process.env.R2_SECRET_ACCESS_KEY ||= "segredo-de-teste";
process.env.R2_BUCKET ||= "balde-de-teste";
process.env.R2_PUBLIC_URL = BUCKET_PUBLICO;

/** O R2 responde sempre que sim — o que se está a medir é o que chega até ele. */
const putImageMock = vi.fn(async (key: string) => ({
  ok: true as const,
  url: `${BUCKET_PUBLICO}/${key}`,
}));
/** Apagar o que foi substituído: conta-se, não se faz. */
const deleteImageByUrlMock = vi.fn(async () => {});

vi.mock("@/lib/r2", async (original) => ({
  ...(await original<typeof import("@/lib/r2")>()),
  isImageStorageReady: () => true,
  putImage: putImageMock,
  deleteImageByUrl: deleteImageByUrlMock,
}));

// `revalidatePath` só existe dentro de um pedido do Next; aqui não há nenhum.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { POST } = await import("@/app/api/uploads/canal/route");
const { updateChannelAction } = await import("@/app/admin/canais/actions");
const { loadMemberships } = await import("@/server/authz");
const { limparBase, temBaseDeDados } = await import("../apoio/base-de-dados");
const { criarCanal, criarMembro, criarUtilizador } = await import("../apoio/fabrica");

/** Um `AuthUser` com as filiações REAIS da base — nunca uma lista inventada. */
async function comoUtilizador(
  conta: { id: string; name: string; email: string; emailVerified: boolean },
  role: AuthUser["role"] = "viewer",
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

// ── Imagens de verdade, feitas na hora ──────────────────────────────────────

/** Um PNG a sério com as medidas pedidas. */
function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .png()
    .toBuffer();
}

/** Um pedido multipart como o browser o faria. */
function pedido(campos: {
  file?: { bytes: Uint8Array | string; nome: string; tipo: string };
  kind?: string;
  channelId?: string;
}): Request {
  const body = new FormData();
  if (campos.kind !== undefined) body.set("kind", campos.kind);
  if (campos.channelId !== undefined) body.set("channelId", campos.channelId);
  if (campos.file) {
    const { bytes, nome, tipo } = campos.file;
    body.set("file", new File([bytes as BlobPart], nome, { type: tipo }));
  }
  return new Request("http://localhost/api/uploads/canal", { method: "POST", body });
}

async function enviar(campos: Parameters<typeof pedido>[0]) {
  const resposta = await POST(pedido(campos));
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

describe.skipIf(!temBaseDeDados())("upload de imagens de canal", () => {
  beforeEach(async () => {
    await limparBase();
    getCurrentUserMock.mockReset();
    putImageMock.mockClear();
    deleteImageByUrlMock.mockClear();
  });

  /** Duas ligas, com dono, equipa e um estranho. O cenário do mundo real. */
  async function duasLigas() {
    const [ligaA, ligaB] = await Promise.all([criarCanal(), criarCanal()]);
    const [donoA, donoB, equipaA, estranho, admin] = await Promise.all([
      criarUtilizador(),
      criarUtilizador(),
      criarUtilizador(),
      criarUtilizador(),
      criarUtilizador({ role: "platform_admin" }),
    ]);
    await Promise.all([
      criarMembro(ligaA.id, donoA.id, "owner"),
      criarMembro(ligaB.id, donoB.id, "owner"),
      criarMembro(ligaA.id, equipaA.id, "staff"),
    ]);
    return { ligaA, ligaB, donoA, donoB, equipaA, estranho, admin };
  }

  // ── 1. QUEM PODE ──────────────────────────────────────────────────────────

  describe("quem pode", () => {
    it("o dono do canal carrega o logo do SEU canal", async () => {
      const { ligaA, donoA } = await duasLigas();
      getCurrentUserMock.mockResolvedValue(await comoUtilizador(donoA));

      const { status, corpo } = await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: { bytes: await png(512, 512), nome: "logo.png", tipo: "image/png" },
      });

      expect(status).toBe(201);
      expect(corpo.url).toContain(`canais/${ligaA.id}/logo-`);
      expect(putImageMock).toHaveBeenCalledTimes(1);
    });

    /*
     * O CORAÇÃO DESTE FICHEIRO. O dono da liga A aponta o endpoint ao id da
     * liga B. 404 — o MESMO que um id inventado devolve, para que a resposta
     * não conte que a liga B existe.
     */
    it("o dono da liga A NÃO carrega no canal da liga B (404, igual a um id inventado)", async () => {
      const { ligaB, donoA } = await duasLigas();
      getCurrentUserMock.mockResolvedValue(await comoUtilizador(donoA));

      const ficheiro = { bytes: await png(512, 512), nome: "logo.png", tipo: "image/png" };
      const alheio = await enviar({ kind: "logo", channelId: ligaB.id, file: ficheiro });
      const inventado = await enviar({
        kind: "logo",
        channelId: "canal-que-nao-existe",
        file: ficheiro,
      });

      expect(alheio.status).toBe(404);
      // Byte a byte a mesma resposta: é isso que impede varrer ids.
      expect(alheio).toEqual(inventado);
      expect(putImageMock).not.toHaveBeenCalled();
    });

    /*
     * Decisão do dono, e é uma decisão de produto: o `staff` opera transmissão
     * e porta. A cara que a liga mostra ao mundo não é operação.
     */
    it("o STAFF do próprio canal é recusado", async () => {
      const { ligaA, equipaA } = await duasLigas();
      getCurrentUserMock.mockResolvedValue(await comoUtilizador(equipaA));

      const { status } = await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: { bytes: await png(512, 512), nome: "logo.png", tipo: "image/png" },
      });

      expect(status).toBe(404);
      expect(putImageMock).not.toHaveBeenCalled();
    });

    it("o platform_admin carrega em qualquer canal, sem ser membro de nenhum", async () => {
      const { ligaA, ligaB, admin } = await duasLigas();
      getCurrentUserMock.mockResolvedValue(await comoUtilizador(admin, "platform_admin"));

      const ficheiro = { bytes: await png(512, 512), nome: "logo.png", tipo: "image/png" };
      const emA = await enviar({ kind: "logo", channelId: ligaA.id, file: ficheiro });
      const emB = await enviar({ kind: "logo", channelId: ligaB.id, file: ficheiro });

      expect([emA.status, emB.status]).toEqual([201, 201]);
    });

    it("quem não é membro de nada é recusado", async () => {
      const { ligaA, estranho } = await duasLigas();
      getCurrentUserMock.mockResolvedValue(await comoUtilizador(estranho));

      const { status } = await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: { bytes: await png(512, 512), nome: "logo.png", tipo: "image/png" },
      });

      expect(status).toBe(404);
    });

    it("sem sessão nenhuma: 401", async () => {
      const { ligaA } = await duasLigas();
      getCurrentUserMock.mockResolvedValue(null);

      const { status } = await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: { bytes: await png(512, 512), nome: "logo.png", tipo: "image/png" },
      });

      expect(status).toBe(401);
    });

    /*
     * Sem `channelId` o pedido é do ecrã de CRIAR canal, onde ainda não há id
     * nenhum para verificar. Criar canais é da FirstRow — e o dono de uma liga
     * não pode usar essa porta para escrever no bucket sem dizer onde.
     */
    it("sem canal, só a FirstRow: o dono de uma liga leva 403", async () => {
      const { donoA, admin } = await duasLigas();
      const ficheiro = { bytes: await png(512, 512), nome: "logo.png", tipo: "image/png" };

      getCurrentUserMock.mockResolvedValue(await comoUtilizador(donoA));
      expect((await enviar({ kind: "logo", file: ficheiro })).status).toBe(403);

      getCurrentUserMock.mockResolvedValue(await comoUtilizador(admin, "platform_admin"));
      const criacao = await enviar({ kind: "logo", file: ficheiro });
      expect(criacao.status).toBe(201);
      // As imagens de um canal por nascer ficam à parte, e com dono.
      expect(criacao.corpo.url).toContain(`canais/_novo/${admin.id}/logo-`);
    });
  });

  // ── 2. O QUE PASSA ────────────────────────────────────────────────────────

  describe("o que passa pela validação", () => {
    async function comoDono() {
      const cenario = await duasLigas();
      getCurrentUserMock.mockResolvedValue(await comoUtilizador(cenario.donoA));
      return cenario;
    }

    /*
     * O ataque clássico: extensão e `Content-Type` a dizer PNG, bytes a dizer
     * outra coisa. Os dois são texto que quem envia escolhe.
     */
    it("um HTML com nome .png e Content-Type image/png é recusado (415)", async () => {
      const { ligaA } = await comoDono();

      const { status, corpo } = await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: {
          bytes: "<html><script>alert(document.cookie)</script></html>",
          nome: "logo.png",
          tipo: "image/png",
        },
      });

      expect(status).toBe(415);
      expect(corpo.error).toContain("não é uma imagem");
      expect(putImageMock).not.toHaveBeenCalled();
    });

    it("um SVG é recusado, e a mensagem diz porquê (415)", async () => {
      const { ligaA } = await comoDono();

      const { status, corpo } = await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: {
          bytes:
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><script>fetch("//fora.pt")</script></svg>',
          nome: "logo.svg",
          tipo: "image/svg+xml",
        },
      });

      expect(status).toBe(415);
      expect(corpo.error).toContain("SVG");
      expect(corpo.error).toContain("PNG");
      expect(putImageMock).not.toHaveBeenCalled();
    });

    it("um logo que não é quadrado é recusado (422), e a queixa diz as medidas", async () => {
      const { ligaA } = await comoDono();

      const { status, corpo } = await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: { bytes: await png(512, 400), nome: "logo.png", tipo: "image/png" },
      });

      expect(status).toBe(422);
      expect(corpo.error).toContain("512×400");
      expect(putImageMock).not.toHaveBeenCalled();
    });

    it("um logo demasiado pequeno é recusado (422)", async () => {
      const { ligaA } = await comoDono();
      const { status, corpo } = await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: { bytes: await png(128, 128), nome: "logo.png", tipo: "image/png" },
      });
      expect(status).toBe(422);
      expect(corpo.error).toContain("256×256");
    });

    it("um banner fora do rácio 3:1 é recusado (422)", async () => {
      const { ligaA } = await comoDono();
      const { status, corpo } = await enviar({
        kind: "banner",
        channelId: ligaA.id,
        file: { bytes: await png(1600, 900), nome: "banner.png", tipo: "image/png" },
      });
      expect(status).toBe(422);
      expect(corpo.error).toContain("3:1");
    });

    it("um banner 3:1 dentro dos limites passa", async () => {
      const { ligaA } = await comoDono();
      const { status } = await enviar({
        kind: "banner",
        channelId: ligaA.id,
        file: { bytes: await png(1500, 500), nome: "banner.png", tipo: "image/png" },
      });
      expect(status).toBe(201);
    });

    /*
     * O `kind` inventado esteve a passar: com `value in IMAGE_RULES`, o
     * `__proto__` dava `true` e as regras vinham do `Object.prototype` — sem
     * `maxBytes`, sem `minWidth`, sem `aspect`. Ou seja, sem validação nenhuma.
     */
    it("um `kind` inventado é recusado antes de tudo (400)", async () => {
      const { ligaA } = await comoDono();
      const ficheiro = { bytes: await png(512, 512), nome: "logo.png", tipo: "image/png" };

      for (const kind of ["avatar", "__proto__", "constructor", ""]) {
        const { status } = await enviar({ kind, channelId: ligaA.id, file: ficheiro });
        expect(status, `kind="${kind}"`).toBe(400);
      }
      expect(putImageMock).not.toHaveBeenCalled();
    });

    it("sem ficheiro nenhum: 400", async () => {
      const { ligaA } = await comoDono();
      expect((await enviar({ kind: "logo", channelId: ligaA.id })).status).toBe(400);
    });

    it("um pedido que não é multipart é recusado (415)", async () => {
      await comoDono();
      const resposta = await POST(
        new Request("http://localhost/api/uploads/canal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "logo" }),
        }),
      );
      expect(resposta.status).toBe(415);
    });

    /*
     * Prova de que a imagem é MESMO voltada a codificar: entra PNG, sai WebP.
     * É isso que deita fora o EXIF e mata os poliglotas.
     */
    it("o que vai para o R2 é WebP, e nunca os bytes que chegaram", async () => {
      const { ligaA } = await comoDono();
      const original = await png(512, 512);

      await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: { bytes: original, nome: "logo.png", tipo: "image/png" },
      });

      const [chave, corpo, contentType] = putImageMock.mock.calls[0] as unknown as [
        string,
        Uint8Array,
        string,
      ];
      expect(chave).toMatch(/\.webp$/);
      expect(contentType).toBe("image/webp");
      expect(Buffer.from(corpo).equals(original)).toBe(false);
      expect((await sharp(corpo).metadata()).format).toBe("webp");
    });

    /*
     * O nome do ficheiro de quem carrega NUNCA entra na chave. Um `../` no
     * nome saía da pasta; um nome repetido esmagava a imagem de outra pessoa.
     */
    it("o nome do ficheiro enviado não aparece na chave do objeto", async () => {
      const { ligaA } = await comoDono();

      await enviar({
        kind: "logo",
        channelId: ligaA.id,
        file: {
          bytes: await png(512, 512),
          nome: "../../../etc/passwd.png",
          tipo: "image/png",
        },
      });

      const chave = putImageMock.mock.calls[0][0];
      expect(chave).not.toContain("passwd");
      expect(chave).not.toContain("..");
      expect(chave).toMatch(new RegExp(`^canais/${ligaA.id}/logo-[0-9a-f-]+\\.webp$`));
    });
  });

  // ── 3. O QUE CHEGA À COLUNA `logo_url` ────────────────────────────────────

  /*
   * A rota é uma porta; a coluna é outra. Um pedido feito à mão à SERVER ACTION
   * — sem passar pela rota nem pelo formulário — podia gravar um URL de fora,
   * e aí o `next/image` recusava servi-lo e a página do canal rebentava no
   * render. Uma liga ficava sem página por causa de um POST.
   */
  describe("gravar a marca do canal", () => {
    const marca = (extra: Record<string, string>) => ({
      name: "Liga do Norte",
      slug: "liga-do-norte",
      tagline: "Batalhas de rap",
      accentColor: "#6cc24a",
      accentColorSecondary: "",
      logoUrl: "",
      bannerUrl: "",
      ...extra,
    });

    async function comoDonoDaLigaA() {
      const cenario = await duasLigas();
      getCurrentUserMock.mockResolvedValue(await comoUtilizador(cenario.donoA));
      return cenario;
    }

    it("aceita um URL do NOSSO bucket", async () => {
      const { ligaA } = await comoDonoDaLigaA();
      const resultado = await updateChannelAction(
        ligaA.id,
        marca({ logoUrl: `${BUCKET_PUBLICO}/canais/${ligaA.id}/logo-abc.webp` }),
      );
      expect(resultado.ok).toBe(true);
    });

    it("aceita um caminho interno — os logos que já vieram no repositório", async () => {
      const { ligaA } = await comoDonoDaLigaA();
      const resultado = await updateChannelAction(ligaA.id, marca({ logoUrl: "/brand/x.svg" }));
      expect(resultado.ok).toBe(true);
    });

    it("RECUSA um URL de um servidor de fora", async () => {
      const { ligaA } = await comoDonoDaLigaA();
      const resultado = await updateChannelAction(
        ligaA.id,
        marca({ logoUrl: "https://atacante.pt/logo.png" }),
      );
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.errors?.logoUrl).toBeDefined();
    });

    /*
     * O truque do prefixo: um domínio que COMEÇA pelo nosso e continua noutro
     * servidor. Um `startsWith` deixava-o passar; a comparação é por origem.
     */
    it("RECUSA um domínio que só começa como o nosso", async () => {
      const { ligaA } = await comoDonoDaLigaA();
      const resultado = await updateChannelAction(
        ligaA.id,
        marca({ bannerUrl: `${BUCKET_PUBLICO}.atacante.pt/canais/x/banner.webp` }),
      );
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.errors?.bannerUrl).toBeDefined();
    });

    it("substituir a imagem manda apagar a antiga — e só depois de gravar", async () => {
      const { ligaA } = await comoDonoDaLigaA();
      const antiga = `${BUCKET_PUBLICO}/canais/${ligaA.id}/logo-antiga.webp`;
      const nova = `${BUCKET_PUBLICO}/canais/${ligaA.id}/logo-nova.webp`;

      await updateChannelAction(ligaA.id, marca({ logoUrl: antiga }));
      deleteImageByUrlMock.mockClear();
      await updateChannelAction(ligaA.id, marca({ logoUrl: nova }));

      expect(deleteImageByUrlMock).toHaveBeenCalledWith(antiga);
    });

    it("gravar sem mexer na imagem não apaga nada", async () => {
      const { ligaA } = await comoDonoDaLigaA();
      const logo = `${BUCKET_PUBLICO}/canais/${ligaA.id}/logo-x.webp`;

      await updateChannelAction(ligaA.id, marca({ logoUrl: logo }));
      deleteImageByUrlMock.mockClear();
      await updateChannelAction(ligaA.id, marca({ logoUrl: logo, tagline: "Outra linha" }));

      expect(deleteImageByUrlMock).not.toHaveBeenCalled();
    });

    it("o dono da liga A não grava a marca da liga B", async () => {
      const { ligaB } = await comoDonoDaLigaA();
      const resultado = await updateChannelAction(ligaB.id, marca({}));
      expect(resultado.ok).toBe(false);
    });
  });
});
