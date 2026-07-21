import { describe, expect, it } from "vitest";
import { accountNavItem } from "@/components/ui/viewer-shell";

/*
 * ============================================================================
 *  "CONTA" OU "INICIAR SESSÃO" — o item de navegação que muda com a sessão
 * ============================================================================
 *
 * Apontamento do dono ao explorar a plataforma: "Na topbar aparece 'Conta'
 * estando ou não com log in. Torna mais explicito tipo 'Iniciar Sessão' /
 * 'Conta'". `accountNavItem` é a decisão inteira, extraída do `ViewerShell`
 * para se testar sem montar componente nenhum.
 */
describe("accountNavItem", () => {
  it("com sessão, mostra Conta e aponta para /conta", () => {
    expect(accountNavItem(true)).toEqual({ label: "Conta", href: "/conta" });
  });

  it("sem sessão, mostra Iniciar Sessão e aponta para /entrar", () => {
    expect(accountNavItem(false)).toEqual({ label: "Iniciar Sessão", href: "/entrar" });
  });
});
