import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type BackofficeGate, gateForPath } from "@/lib/backoffice-zones";
import {
  type AuthUser,
  backofficeHomeFor,
  canEnterBackoffice,
  canManageAnyChannel,
  canOpenBackofficePath,
} from "@/server/authz";

/*
 * ============================================================================
 *  A MATRIZ DE ACESSOS DO BACKOFFICE — papel × página, uma linha de cada vez
 * ============================================================================
 *
 * O que este ficheiro impede: o `staff` da porta chegar ao dinheiro da liga.
 *
 * O `league_staff` existe para validar bilhetes à entrada do recinto, e para
 * isso precisa de `/admin/scanner`. Durante muito tempo o backoffice inteiro
 * cortava numa pergunta só ("é dono de algum canal?"), o que deixava o scanner
 * inalcançável a quem foi feito para o usar. Abrir essa porta obrigou a pôr
 * gate próprio em cada página de dinheiro ANTES — e é essa a matriz que se
 * verifica aqui, papel a papel e caminho a caminho.
 *
 * PORQUE É QUE O TESTE PERCORRE UMA LISTA DE ROTAS ESCRITA À MÃO
 * Porque o perigo não é a rota que existe hoje — é a que alguém acrescenta
 * amanhã. A lista abaixo é comparada com as páginas REAIS de `app/admin/**`
 * (último bloco): uma página nova sem linha na matriz faz este ficheiro ficar
 * vermelho, e quem a criou tem de decidir de propósito quem a pode abrir.
 *
 * A medição de ponta a ponta — pedir cada rota a um servidor a sério, com
 * sessão de `league_staff`, e contar marcadores de dinheiro no corpo em bruto —
 * está no relatório desta frente. Isto é a rede que apanha a regressão sem ser
 * preciso levantar nada.
 */

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

const CANAL = "canal-a";
const OUTRO = "canal-b";

/** Os quatro papéis que interessam, tal como chegam de `getCurrentUser()`. */
const PAPEIS = {
  anonimo: null,
  viewer: utilizador({}),
  staff: utilizador({ memberships: [{ channelId: CANAL, role: "staff" }] }),
  owner: utilizador({ memberships: [{ channelId: CANAL, role: "owner" }] }),
  admin: utilizador({ role: "platform_admin" }),
} satisfies Record<string, AuthUser | null>;

type Papel = keyof typeof PAPEIS;

/*
 * A MATRIZ. `abre` é a lista dos papéis que podem ABRIR o caminho — o que veem
 * lá dentro é outra pergunta, e é o `ChannelScope` que a responde.
 *
 * `anonimo` nunca aparece: sem sessão o `proxy.ts` manda para `/entrar` antes
 * de chegar a esta decisão. Está coberto no bloco próprio, mais abaixo.
 */
const MATRIZ: readonly { rota: string; gate: BackofficeGate; abre: readonly Papel[] }[] = [
  // ── Dinheiro e dados de compradores: só quem gere ────────────────────────
  { rota: "/admin", gate: "manage", abre: ["owner", "admin"] },
  { rota: "/admin/ganhos", gate: "manage", abre: ["owner", "admin"] },
  { rota: "/admin/subscritores", gate: "manage", abre: ["owner", "admin"] },
  { rota: "/admin/pagamentos", gate: "manage", abre: ["owner", "admin"] },
  // A lista de eventos traz PPV, compradores e receita por linha.
  { rota: "/admin/eventos", gate: "manage", abre: ["owner", "admin"] },
  // Criar um evento provisiona vídeo na Cloudflare — custa dinheiro.
  { rota: "/admin/eventos/novo", gate: "manage", abre: ["owner", "admin"] },
  // Marca e membros de um canal; o gate FINO (é o TEU canal?) é do channel-access.
  { rota: "/admin/canais", gate: "manage", abre: ["owner", "admin"] },
  { rota: "/admin/canais/evt_1", gate: "manage", abre: ["owner", "admin"] },
  { rota: "/admin/canais/evt_1/membros", gate: "manage", abre: ["owner", "admin"] },

  // ── A porta do recinto: é por isto que o staff entra ─────────────────────
  { rota: "/admin/scanner", gate: "operate", abre: ["staff", "owner", "admin"] },

  // ── Ecrãs de UM evento: operar é da equipa; editar continua a ser do dono,
  //    e essa distinção é de `server/event-access.ts`, que sabe o canal ──────
  { rota: "/admin/eventos/evt_1/transmissao", gate: "operate", abre: ["staff", "owner", "admin"] },
  { rota: "/admin/eventos/evt_1/bilhetes", gate: "operate", abre: ["staff", "owner", "admin"] },
  { rota: "/admin/eventos/evt_1/editar", gate: "operate", abre: ["staff", "owner", "admin"] },

  // ── Só a FirstRow ────────────────────────────────────────────────────────
  { rota: "/admin/plataforma", gate: "platform", abre: ["admin"] },
  { rota: "/admin/canais/novo", gate: "platform", abre: ["admin"] },
];

describe("o gate de cada rota do backoffice", () => {
  it.each(MATRIZ)("$rota exige $gate", ({ rota, gate }) => {
    expect(gateForPath(rota)).toBe(gate);
  });

  /*
   * A rede por baixo da rede: um caminho que ninguém previu cai no gate MAIS
   * FORTE dos que fazem sentido, não no mais fraco. Uma página nova nasce
   * fechada ao staff — quem a quiser abrir tem de ir dizê-lo à tabela.
   */
  it("um caminho desconhecido de /admin exige `manage`, não `operate`", () => {
    expect(gateForPath("/admin/relatorio-que-ainda-nao-existe")).toBe("manage");
    expect(gateForPath("/admin/eventos/evt_1/algo/muito/fundo")).toBe("operate");
  });
});

describe("a matriz: quem abre o quê", () => {
  for (const { rota, abre } of MATRIZ) {
    const papeis = Object.keys(PAPEIS) as Papel[];

    for (const papel of papeis.filter((p) => p !== "anonimo")) {
      const devia = abre.includes(papel);
      it(`${papel} ${devia ? "ABRE" : "não abre"} ${rota}`, () => {
        expect(canOpenBackofficePath(PAPEIS[papel], rota)).toBe(devia);
      });
    }
  }
});

describe("o staff da porta e o dinheiro", () => {
  /*
   * O teste que resume a frente. Se algum destes caminhos passar a deixar
   * entrar o staff, a contabilidade da liga fica exposta a quem só devia estar
   * a ler QR codes à entrada.
   */
  const DINHEIRO = [
    "/admin",
    "/admin/ganhos",
    "/admin/subscritores",
    "/admin/pagamentos",
    "/admin/eventos",
    "/admin/plataforma",
  ];

  it.each(DINHEIRO)("o staff não abre %s", (rota) => {
    expect(canOpenBackofficePath(PAPEIS.staff, rota)).toBe(false);
  });

  it("mas abre o scanner, que é o que veio cá fazer", () => {
    expect(canOpenBackofficePath(PAPEIS.staff, "/admin/scanner")).toBe(true);
  });

  it("um viewer sem filiações não abre nada, nem sequer o scanner", () => {
    for (const { rota } of MATRIZ) {
      expect(canOpenBackofficePath(PAPEIS.viewer, rota)).toBe(false);
    }
  });

  it("sem sessão não se abre nada", () => {
    for (const { rota } of MATRIZ) {
      expect(canOpenBackofficePath(null, rota)).toBe(false);
    }
  });
});

describe("os dois predicados da porta não são o mesmo", () => {
  /*
   * A armadilha desta frente, escrita como teste.
   *
   * `canEnterBackoffice` alargou para deixar o staff chegar ao scanner. Quem
   * usava esse nome para guardar DINHEIRO — a action de reconciliação de
   * pagamentos, o botão de criar evento — tinha de passar a
   * `canManageAnyChannel`. Se um dia alguém voltar a fundir os dois, isto cai.
   */
  it("o staff entra no backoffice mas não gere canal nenhum", () => {
    expect(canEnterBackoffice(PAPEIS.staff)).toBe(true);
    expect(canManageAnyChannel(PAPEIS.staff)).toBe(false);
  });

  it("o dono passa nos dois", () => {
    expect(canEnterBackoffice(PAPEIS.owner)).toBe(true);
    expect(canManageAnyChannel(PAPEIS.owner)).toBe(true);
  });

  it("o platform_admin passa nos dois sem ser membro de nada", () => {
    expect(PAPEIS.admin.memberships).toHaveLength(0);
    expect(canEnterBackoffice(PAPEIS.admin)).toBe(true);
    expect(canManageAnyChannel(PAPEIS.admin)).toBe(true);
  });

  it("uma filiação com papel que a base não conhece não é acesso", () => {
    const estranho = utilizador({
      // O schema à frente do código, ou o contrário. Passa pelo `unknown`
      // porque o tipo não admite este papel — que é precisamente o que se testa.
      memberships: [
        { channelId: CANAL, role: "administrador" },
      ] as unknown as AuthUser["memberships"],
    });
    expect(canEnterBackoffice(estranho)).toBe(false);
    expect(canOpenBackofficePath(estranho, "/admin/scanner")).toBe(false);
  });
});

describe("para onde é que cada um é mandado", () => {
  it("quem gere vai para o painel", () => {
    expect(backofficeHomeFor(PAPEIS.owner)).toBe("/admin");
    expect(backofficeHomeFor(PAPEIS.admin)).toBe("/admin");
  });

  it("quem só opera vai para o scanner — não para uma recusa", () => {
    expect(backofficeHomeFor(PAPEIS.staff)).toBe("/admin/scanner");
  });

  it("quem gere um canal e é equipa noutro vai para o painel", () => {
    const misto = utilizador({
      memberships: [
        { channelId: OUTRO, role: "staff" },
        { channelId: CANAL, role: "owner" },
      ],
    });
    expect(backofficeHomeFor(misto)).toBe("/admin");
  });

  it("quem não tem backoffice não tem casa", () => {
    expect(backofficeHomeFor(PAPEIS.viewer)).toBeNull();
    expect(backofficeHomeFor(null)).toBeNull();
  });
});

/*
 * ============================================================================
 *  AS DUAS PROMESSAS QUE ESTA TABELA FAZ AO CÓDIGO — verificadas na fonte
 * ============================================================================
 */

describe("a matriz cobre as páginas que existem mesmo", () => {
  /*
   * Sem isto, a matriz acima envelhecia em silêncio: uma página nova em
   * `app/admin/` não aparecia em lado nenhum e ficava a viver do gate por
   * omissão sem ninguém ter decidido nada.
   */
  it("todas as páginas de app/admin têm linha na matriz", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const raiz = new URL("../../app/admin/", import.meta.url).pathname;

    /** Os caminhos de rota de todas as `page.tsx` debaixo de `app/admin`. */
    function rotas(dir: string, prefixo = "/admin"): string[] {
      const encontradas: string[] = [];
      for (const entrada of readdirSync(dir)) {
        const caminho = `${dir}${entrada}`;
        if (statSync(caminho).isDirectory()) {
          // `[id]` vira um id de exemplo — a matriz usa `evt_1`.
          const segmento = entrada.startsWith("[") ? "evt_1" : entrada;
          encontradas.push(...rotas(`${caminho}/`, `${prefixo}/${segmento}`));
        } else if (entrada === "page.tsx") {
          encontradas.push(prefixo);
        }
      }
      return encontradas;
    }

    const naMatriz = new Set(MATRIZ.map((linha) => linha.rota));
    const semLinha = rotas(raiz).filter((rota) => !naMatriz.has(rota));

    expect(semLinha).toEqual([]);
  });
});

describe("as zonas `platform` travam-se a si próprias", () => {
  /*
   * O `proxy.ts` deixa passar as zonas `platform` DE PROPÓSITO: a recusa delas
   * tem de ser um 404 da própria página, porque um redirect para `/sem-acesso`
   * contava a quem não é da FirstRow que o ecrã existe — que é exatamente o que
   * o 404 esconde.
   *
   * Essa decisão só é segura enquanto estas páginas se travarem a si mesmas,
   * ANTES da primeira query. Como isso é uma propriedade do CÓDIGO e não de um
   * valor, testa-se lendo o código. Se o gate próprio desaparecer, a linha do
   * proxy passa a ser um buraco — e isto fica vermelho primeiro.
   */
  const PAGINAS = ["app/admin/plataforma/page.tsx", "app/admin/canais/novo/page.tsx"];

  it.each(PAGINAS)("%s tem gate próprio e responde notFound()", (ficheiro) => {
    const fonte = readFileSync(new URL(`../../${ficheiro}`, import.meta.url), "utf8");

    // Ou verifica `isPlatformAdmin` à mão, ou delega em `requireChannelCreator`,
    // que é o mesmo predicado com nome de intenção.
    expect(fonte).toMatch(/isPlatformAdmin|requireChannelCreator/);
    expect(fonte).toMatch(/notFound\(\)|requireChannelCreator/);
  });
});
