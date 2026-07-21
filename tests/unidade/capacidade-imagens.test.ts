import { afterEach, describe, expect, it, vi } from "vitest";
import { R2_VARS } from "@/lib/r2";
import { reportStartupConfig } from "@/lib/startup-check";

/*
 * ============================================================================
 *  "IMAGENS DE CANAL" DEGRADA-SE, NÃO REBENTA
 * ============================================================================
 *
 * A promessa do `lib/startup-check.ts`: uma capacidade que falta é ANUNCIADA,
 * e uma que falta sem custar dinheiro nem acesso é anunciada como AVISO, não
 * como erro. Sem isto o padrão volta a ser o de sempre — a peça desliga-se
 * sozinha, educadamente, e ninguém soma as partes (foi assim que o login com
 * Google esteve semanas desligado em produção).
 *
 * Testa-se o VALOR DEVOLVIDO e o canal de log, e não o texto: a redação muda,
 * a promessa não.
 */

const guardado = new Map<string, string | undefined>();

function semR2() {
  for (const nome of R2_VARS) {
    guardado.set(nome, process.env[nome]);
    delete process.env[nome];
  }
}

function comR2() {
  for (const nome of R2_VARS) {
    guardado.set(nome, process.env[nome]);
    process.env[nome] = "valor-de-teste";
  }
}

afterEach(() => {
  for (const [nome, valor] of guardado) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
  guardado.clear();
  vi.restoreAllMocks();
});

describe("a capacidade das imagens de canal", () => {
  it("é relatada quando falta alguma das cinco variáveis", () => {
    semR2();
    expect(reportStartupConfig()).toContain("Imagens de canal");
  });

  /*
   * Uma só chega para desligar a capacidade. Meia configuração dava um erro de
   * rede opaco na cara de quem carregasse uma imagem, em vez de um aviso no
   * arranque — ver `r2Config()`.
   */
  it("basta faltar UMA para a capacidade contar como em falta", () => {
    comR2();
    delete process.env.R2_BUCKET;
    expect(reportStartupConfig()).toContain("Imagens de canal");
  });

  it("cala-se quando estão as cinco", () => {
    comR2();
    expect(reportStartupConfig()).not.toContain("Imagens de canal");
  });

  /*
   * NÃO-GRAVE, e é a parte que interessa: sem R2 ninguém deixa de comprar, de
   * ver ou de entrar — um canal sem logo mostra as iniciais, como já fazia.
   * Se um dia isto virar `grave: true`, o arranque passa a gritar por uma coisa
   * que não impede um evento de acontecer, e o grito deixa de se ouvir.
   */
  it("sai como AVISO e não como erro quando é a única coisa a faltar", () => {
    // Todas as outras capacidades configuradas; só o R2 é que não.
    const outras = [
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_STREAM_API_TOKEN",
      "CLOUDFLARE_STREAM_SIGNING_KEY_ID",
      "CLOUDFLARE_STREAM_SIGNING_KEY_JWK",
      "EUPAGO_API_KEY",
      "EUPAGO_WEBHOOK_SECRET",
      "EUPAGO_LEAGUE_EXTERNKEY",
      "EUPAGO_PLATFORM_EXTERNKEY",
    ];
    for (const nome of outras) {
      guardado.set(nome, process.env[nome]);
      process.env[nome] = "valor-de-teste";
    }
    semR2();

    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(reportStartupConfig()).toEqual(["Imagens de canal"]);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(erro).not.toHaveBeenCalled();
  });
});
