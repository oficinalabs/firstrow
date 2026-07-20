import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { shortCode } from "@/server/tickets";

/*
 * ============================================================================
 *  O CÓDIGO CURTO DO BILHETE — o que se dita à porta quando a câmara falha
 * ============================================================================
 *
 * É o "FR-7K2M-99" impresso sob o QR. Não guarda segredo nenhum (deriva do
 * token, não o substitui) mas tem de cumprir duas coisas para servir à porta,
 * com barulho e pressa:
 *
 *   · ser DETERMINÍSTICO — o mesmo token dá sempre o mesmo código, senão o que
 *     está no papel não bate certo com o que o sistema calcula;
 *   · não ter caracteres que se confundem ao ouvido ou à vista (0/O, 1/I), que
 *     à porta, com fila, é meio minuto perdido por engano.
 *
 * Estes testes são puros — não tocam na base de dados. A validação à porta, que
 * lê a base, está em `tests/integracao/qr-validacao.test.ts`.
 */

function tokenFalso(): string {
  return `frt_${randomBytes(24).toString("base64url")}`;
}

describe("shortCode", () => {
  it("tem o formato FR-XXXX-XX", () => {
    expect(shortCode(tokenFalso())).toMatch(/^FR-[0-9A-Z]{4}-[0-9A-Z]{2}$/);
  });

  it("é determinístico — o mesmo token dá sempre o mesmo código", () => {
    const token = tokenFalso();

    expect(shortCode(token)).toBe(shortCode(token));
  });

  it("nunca usa caracteres ambíguos (0, O, 1, I)", () => {
    // Uma amostra grande cobre o alfabeto todo com folga.
    for (let i = 0; i < 2_000; i++) {
      const corpo = shortCode(tokenFalso()).replace(/^FR-|-/g, "");

      expect(corpo).not.toMatch(/[01OI]/);
    }
  });

  /*
   * Tokens diferentes devem dar códigos diferentes na esmagadora maioria dos
   * casos. Não é uma garantia criptográfica — são só 6 caracteres, há colisões
   * possíveis — mas uma taxa de colisão alta seria sinal de que o código não
   * está a usar o alfabeto todo (um bug de índice, por exemplo).
   */
  it("espalha os códigos — colisões são raras numa amostra grande", () => {
    const vistos = new Set<string>();
    const total = 5_000;
    for (let i = 0; i < total; i++) vistos.add(shortCode(tokenFalso()));

    // 31^6 ≈ 887 milhões de combinações; em 5000 sorteios as colisões contam-se
    // pelos dedos. Um limite generoso apanha um bug grave sem ser intermitente.
    expect(vistos.size).toBeGreaterThan(total * 0.99);
  });
});
