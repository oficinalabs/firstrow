import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  descriptionLength,
  MAX_DESCRIPTION_LENGTH,
  normalizeDescription,
  summarizeDescription,
  validateEventForm,
} from "@/lib/event-rules";

/*
 * ============================================================================
 *  A DESCRIÇÃO DO EVENTO — texto de utilizador numa página pública
 * ============================================================================
 *
 * Três coisas a provar, e a ordem é a da importância:
 *
 *  1. O limite é imposto NO SERVIDOR. O `maxLength` do `<textarea>` é conforto;
 *     quem fala com a server action à mão não passa por ele.
 *  2. Uma recusa NÃO PERDE o que foi escrito. É a regra que nasceu dos 16
 *     eventos duplicados em produção e vale para o campo novo como para os
 *     outros.
 *  3. Não há caminho por onde a descrição vire HTML. Isso não se prova com uma
 *     lista de payloads (a lista está sempre incompleta) — prova-se mostrando
 *     que o texto é guardado LITERAL e que nenhum ecrã o injeta como marcação.
 */

/*
 * Os invisíveis entram aqui por construção, nunca como o byte cru no ficheiro.
 * O byte cru corre exactamente igual, mas torna o teste impossível de rever: a
 * linha parece limpa no editor e ninguém vê o que está mesmo a ser passado.
 * (É a mesma razão pela qual o `duplicateLockKey`, em server/events.ts, escreve
 * o separador como escape.)
 */
const car = (codigo: number) => String.fromCharCode(codigo);

const NUL = car(0x00);
const ESC = car(0x1b);
/** CSI — um C1, do intervalo que passa despercebido a filtros só de C0. */
const CSI = car(0x9b);
const ZERO_WIDTH = car(0x200b);
/** RIGHT-TO-LEFT OVERRIDE: inverte visualmente o resto da linha. */
const RTL_OVERRIDE = car(0x202e);
const NBSP = car(0x00a0);

/** Um formulário válido, com a descrição que o teste quiser. */
function submissao(description: string) {
  return {
    title: "SB Clash #15",
    description,
    date: "2099-09-01",
    time: "21:00",
    price: "7,50",
    ticketPrice: "",
    ticketCapacity: "",
    canal: "",
  };
}

describe("normalizeDescription", () => {
  it("aceita quebras de linha — uma descrição de batalha tem parágrafos", () => {
    expect(normalizeDescription("Primeira linha\nSegunda linha")).toBe(
      "Primeira linha\nSegunda linha",
    );
  });

  it("uniformiza CRLF e CR soltos numa só quebra", () => {
    expect(normalizeDescription("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("deixa no máximo uma linha em branco entre parágrafos", () => {
    expect(normalizeDescription("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("tira os caracteres de controlo que não se veem mas contam", () => {
    // NUL, ESC e um C1: invisíveis no ecrã, perigosos num log ou num CSV.
    expect(normalizeDescription(`Fi${NUL}nal${ESC} da ${CSI}Época`)).toBe("Final da Época");
  });

  it("tira os invisíveis de formatação Unicode", () => {
    // Zero-width (disfarça palavras) e RLO (inverte o resto da linha — engano
    // em cima de um preço ou de uma data).
    expect(normalizeDescription(`gra${ZERO_WIDTH}tis ${RTL_OVERRIDE}abc`)).toBe("gratis abc");
  });

  it("tira espaço pendurado no fim de cada linha, incluindo o inquebrável", () => {
    expect(normalizeDescription(`uma linha  ${NBSP}\noutra  `)).toBe("uma linha\noutra");
  });

  it("guarda o texto LITERAL — não escapa nem reescreve marcação", () => {
    /*
     * Isto parece o contrário do que se espera de um teste de segurança, e é de
     * propósito: escapar aqui era escapar DUAS vezes (o React escapa outra vez
     * ao desenhar) e a liga via `&lt;script&gt;` na página dela. A defesa está
     * no RENDER, não no armazenamento — ver o último bloco deste ficheiro.
     */
    const bruto = '<script>alert(1)</script> & <img src=x onerror="x">';
    expect(normalizeDescription(bruto)).toBe(bruto);
  });
});

describe("descriptionLength", () => {
  it("conta pontos de código, não unidades UTF-16", () => {
    // Sem isto, o contador do formulário e a recusa do servidor discordavam
    // exactamente nos textos com emoji — que numa liga de rap não são raros.
    expect("🥊".length).toBe(2);
    expect(descriptionLength("🥊")).toBe(1);
  });
});

describe("o limite, imposto no servidor", () => {
  it("aceita uma descrição no limite exacto", () => {
    const resultado = validateEventForm(submissao("a".repeat(MAX_DESCRIPTION_LENGTH)));

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(descriptionLength(resultado.draft.description ?? "")).toBe(MAX_DESCRIPTION_LENGTH);
    }
  });

  it("recusa um caractere acima — sem o formulário pelo meio", () => {
    const resultado = validateEventForm(submissao("a".repeat(MAX_DESCRIPTION_LENGTH + 1)));

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.errors.description).toContain("Descrição a mais");
  });

  it("mede DEPOIS de normalizar — o que vai ser descartado não conta", () => {
    /*
     * Um texto colado do Word chega com `\r\n` a cada linha. Contá-lo em bruto
     * recusava descrições que, depois de limpas, cabem à vontade — e a pessoa
     * ficava a olhar para um contador que dizia que cabia.
     */
    const comCR = `${"a".repeat(MAX_DESCRIPTION_LENGTH - 1)}\r\n`;
    expect(comCR.length).toBeGreaterThan(MAX_DESCRIPTION_LENGTH);

    const resultado = validateEventForm(submissao(comCR));
    expect(resultado.ok).toBe(true);
  });

  it("uma recusa devolve o que foi escrito, tal e qual", () => {
    // A regra dos 16 eventos duplicados: nada do que a pessoa escreveu se perde
    // por causa de um erro de validação — e devolve-se em BRUTO, não limpo, para
    // o cursor dela não saltar por baixo dos dedos.
    const escrito = `${"a".repeat(MAX_DESCRIPTION_LENGTH + 50)}\r\ncom CRLF`;
    const resultado = validateEventForm(submissao(escrito));

    expect(resultado.ok).toBe(false);
    expect(resultado.values.description).toBe(escrito);
    // E o resto do formulário também não se perde.
    expect(resultado.values.title).toBe("SB Clash #15");
    expect(resultado.values.price).toBe("7,50");
  });

  it("campo em branco vira NULL, não uma cadeia vazia", () => {
    for (const vazio of ["", "   ", "\n\n", ZERO_WIDTH, NBSP]) {
      const resultado = validateEventForm(submissao(vazio));
      expect(resultado.ok).toBe(true);
      if (resultado.ok) expect(resultado.draft.description).toBeNull();
    }
  });

  it("um campo ausente não rebenta a validação", () => {
    // Um pedido à mão sem o campo, ou um formulário de antes desta coluna.
    const { description: _descartado, ...semCampo } = submissao("x");
    const resultado = validateEventForm(semCampo);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.draft.description).toBeNull();
  });
});

describe("summarizeDescription — o texto de partilha", () => {
  it("achata as quebras de linha (uma meta tag não tem parágrafos)", () => {
    expect(summarizeDescription("Primeira\n\nSegunda", 100)).toBe("Primeira Segunda");
    expect(summarizeDescription("a\nb", 100)).not.toContain("\n");
  });

  it("devolve vazio quando não há descrição", () => {
    expect(summarizeDescription(null, 100)).toBe("");
    expect(summarizeDescription("", 100)).toBe("");
  });

  it("corta numa fronteira de palavra e assina o corte", () => {
    const resumo = summarizeDescription("palavras compridas que não cabem aqui", 20);

    expect(descriptionLength(resumo)).toBeLessThanOrEqual(20);
    expect(resumo.endsWith("…")).toBe(true);
    // Nunca a meio de uma palavra.
    expect(resumo).toBe("palavras compridas…");
  });

  it("não corta o que já cabe", () => {
    expect(summarizeDescription("curta", 100)).toBe("curta");
  });
});

describe("nenhum ecrã injeta a descrição como HTML", () => {
  /*
   * A garantia real contra injeção não é uma lista de payloads filtrados — é
   * não haver caminho nenhum de texto para marcação. Como isso é uma
   * propriedade do CÓDIGO e não de um valor, testa-se lendo o código.
   *
   * Se um dia alguém trocar o `whitespace-pre-line` por um `\n` → `<br>` com
   * `dangerouslySetInnerHTML` — que é o atalho óbvio e o erro clássico — isto
   * fica vermelho antes de o commit sair da máquina.
   */
  const FICHEIROS = [
    "app/eventos/[eventId]/page.tsx",
    // A página de VER passou a mostrar a descrição ao lado do vídeo. É o mesmo
    // texto de utilizador, no mesmo produto, e por isso a mesma proibição: se
    // ficasse de fora desta lista, o segundo sítio a desenhá-la era o sítio por
    // onde a regra se perdia.
    "app/eventos/[eventId]/ver/page.tsx",
    "components/admin/event-form.tsx",
    "lib/event-rules.ts",
  ];

  it.each(FICHEIROS)("%s não usa dangerouslySetInnerHTML", (ficheiro) => {
    const fonte = readFileSync(new URL(`../../${ficheiro}`, import.meta.url), "utf8");
    // Os comentários mencionam o nome para explicar a proibição; o que não pode
    // existir é uma UTILIZAÇÃO — o nome seguido de `=` ou de `:`.
    expect(fonte).not.toMatch(/dangerouslySetInnerHTML\s*[=:]/);
  });

  const DESENHAM_A_DESCRICAO = [
    "app/eventos/[eventId]/page.tsx",
    "app/eventos/[eventId]/ver/page.tsx",
  ];

  it.each(DESENHAM_A_DESCRICAO)("%s desenha as quebras com CSS, não com marcação", (ficheiro) => {
    const fonte = readFileSync(new URL(`../../${ficheiro}`, import.meta.url), "utf8");

    expect(fonte).toContain("whitespace-pre-line");
    expect(fonte).toContain("{event.description}");
  });
});
