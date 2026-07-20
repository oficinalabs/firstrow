import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser, ChannelMembership } from "@/server/authz";

/*
 * ============================================================================
 *  O ATALHO PARA O BACKOFFICE — quem o vê, e quem NÃO O RECEBE DE TODO
 * ============================================================================
 *
 * A diferença entre "não vê" e "não recebe" é a coisa toda. Um `<Link>`
 * renderizado e tapado com CSS viaja no HTML e no payload RSC na mesma: quem
 * abre o código-fonte da página fica a saber que aquela conta tem poderes de
 * backoffice, e onde é a porta.
 *
 * Por isso a asserção do espectador aqui não é "está escondido" — é `null`.
 * O componente não devolve elemento nenhum, logo não há nada para serializar.
 *
 * (A medição de ponta a ponta — contar as ocorrências no corpo em bruto de uma
 * resposta real, com uma sessão de espectador — está no relatório desta frente.
 * Isto é a rede que apanha uma regressão sem ser preciso levantar um servidor.)
 */

const getCurrentUserMock = vi.fn<() => Promise<AuthUser | null>>();

/*
 * Só o `getCurrentUser` é substituído. `canEnterBackoffice` é o VERDADEIRO —
 * é ele que se quer testar através do componente. Um mock dos dois testava o
 * mock.
 */
vi.mock("@/server/authz", async (original) => ({
  ...(await original<typeof import("@/server/authz")>()),
  getCurrentUser: getCurrentUserMock,
}));

const { BackofficeLink } = await import("@/components/ui/backoffice-link");

function utilizador(role: AuthUser["role"], memberships: ChannelMembership[] = []): AuthUser {
  return {
    id: "u1",
    name: "Pessoa",
    email: "pessoa@exemplo.test",
    emailVerified: true,
    role,
    memberships,
  };
}

/** O elemento que o componente devolve, ou `null`. */
async function render() {
  return BackofficeLink();
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
});

describe("quem NÃO recebe o atalho", () => {
  it("visitante sem sessão", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect(await render()).toBeNull();
  });

  it("espectador comum — o caso que interessa", async () => {
    getCurrentUserMock.mockResolvedValue(utilizador("viewer"));
    expect(await render()).toBeNull();
  });

  it("espectador que comprou eventos mas não é membro de canal nenhum", async () => {
    getCurrentUserMock.mockResolvedValue(utilizador("viewer", []));
    expect(await render()).toBeNull();
  });

  it("staff de um canal — o portão do /admin também lhe fecha", async () => {
    /*
     * O plano dizia "qualquer filiação em channel_members". Não é o que o
     * produto faz: `canEnterBackoffice` exige `owner`, porque `/admin/ganhos` e
     * `/admin/subscritores` não têm gate próprio (ver app/admin/layout.tsx). Dar
     * o link ao staff era dar-lhe um atalho que acaba em `/sem-acesso`.
     *
     * Este teste é o que segura as duas pontas juntas: no dia em que o staff
     * puder entrar, ele fica vermelho e obriga a decidir de propósito.
     */
    getCurrentUserMock.mockResolvedValue(
      utilizador("viewer", [{ channelId: "c1", role: "staff" }]),
    );
    expect(await render()).toBeNull();
  });

  it("papel desconhecido na base de dados não é acesso", async () => {
    // Uma conta com um papel de antes da migração multi-canal, ou o schema à
    // frente do código. O menos poderoso, nunca o mais.
    const estranho = { ...utilizador("viewer"), role: "league_owner" } as unknown as AuthUser;
    getCurrentUserMock.mockResolvedValue(estranho);
    expect(await render()).toBeNull();
  });

  it("filiação com papel que a base de dados não conhece também não", async () => {
    const membroEstranho = [
      { channelId: "c1", role: "administrador" },
    ] as unknown as ChannelMembership[];
    getCurrentUserMock.mockResolvedValue(utilizador("viewer", membroEstranho));
    expect(await render()).toBeNull();
  });
});

describe("quem recebe o atalho", () => {
  it("dono de um canal", async () => {
    getCurrentUserMock.mockResolvedValue(
      utilizador("viewer", [{ channelId: "c1", role: "owner" }]),
    );

    const elemento = await render();
    expect(elemento).not.toBeNull();
    expect(elemento?.props.href).toBe("/admin");
    // A 375px sobra só o ícone (a palavra não cabe na barra), por isso o nome
    // acessível não pode depender do texto visível.
    expect(elemento?.props["aria-label"]).toBe("Backoffice");
  });

  it("platform_admin, mesmo sem ser membro de nada", async () => {
    getCurrentUserMock.mockResolvedValue(utilizador("platform_admin"));

    const elemento = await render();
    expect(elemento?.props.href).toBe("/admin");
  });

  it("dono num canal e staff noutro — basta ser dono de algum", async () => {
    getCurrentUserMock.mockResolvedValue(
      utilizador("viewer", [
        { channelId: "c1", role: "staff" },
        { channelId: "c2", role: "owner" },
      ]),
    );

    expect(await render()).not.toBeNull();
  });

  it("o alvo de toque tem os 44px e o foco é o global", async () => {
    getCurrentUserMock.mockResolvedValue(utilizador("platform_admin"));

    const classes: string = (await render())?.props.className ?? "";
    // 44px nas duas dimensões. Só a altura não chegava: em telemóvel sobra o
    // ícone sozinho, e o alvo media 31px de largura (medido a 375px).
    expect(classes).toContain("min-h-11");
    expect(classes).toContain("min-w-11");
    // Nada de `focus:` local — o `:focus-visible` de app/globals.css já desenha
    // o anel em tudo o que é focável, e uma regra por cima era outra a divergir.
    expect(classes).not.toContain("focus:");
  });
});
