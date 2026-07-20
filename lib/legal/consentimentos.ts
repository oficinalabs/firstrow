import type { ConsentKind } from "@/db/schema";

/*
 * ============================================================================
 *  TEXTOS DE CONSENTIMENTO DO CHECKOUT — versionados, imutáveis
 * ============================================================================
 *
 * Fonte: `docs/legal/CONTEUDO-PAGINAS.md`, secção 6. As frases aqui são cópia
 * literal desse documento — mudar uma palavra é mudar o que a lei nos obriga a
 * conseguir provar, e por isso não se faz sem passar por lá primeiro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE ISTO É VERSIONADO E NÃO UMA CONSTANTE SOLTA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A prova de consentimento tem de dizer o que a pessoa viu **naquele dia**. Se
 * daqui a um ano o advogado mandar reescrever a frase da renúncia, todas as
 * compras antigas continuam a ter de dizer a frase antiga — senão a prova
 * mente, e uma prova que mente é pior do que não haver prova nenhuma.
 *
 * Daí o `HISTORICO`: um mapa de versão → texto, em que **uma entrada publicada
 * nunca se edita**. Mudar a redação = acrescentar uma entrada nova e apontar
 * `VERSAO_CONSENTIMENTO` para ela. As antigas ficam para sempre, porque é por
 * elas que se reconstrói o que foi mostrado numa compra de 2026.
 *
 * A linha guardada em `purchase_consents` leva o texto COMPLETO, não a versão:
 * a versão é a etiqueta que permite reconstruir e comparar, mas se um dia este
 * ficheiro desaparecer a prova continua a valer por si. Cinto e suspensórios,
 * de propósito — é o único registo que temos de conseguir apresentar a um juiz.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  QUEM ESCOLHE O TEXTO É O SERVIDOR
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O browser envia a VERSÃO e o resultado da checkbox — nunca o texto. Se
 * enviasse o texto, qualquer pessoa podia forjar a sua própria prova de
 * consentimento ("aceitei que podia cancelar quando quisesse") e nós
 * guardávamos isso a sério. O texto sai sempre daqui, no servidor, a partir do
 * par (tipo, versão).
 */

/**
 * Versão em vigor. Sobe **só** quando a redação do checkout muda — não quando
 * se mexe nas páginas legais (essas têm `ATUALIZADO_EM` em `lib/legal/paginas.ts`).
 */
export const VERSAO_CONSENTIMENTO = "2026-07-19";

export type CopiaConsentimento = {
  /** Parágrafos informativos mostrados antes do botão de pagamento. */
  readonly informativo: readonly string[];
  /**
   * Rótulo da checkbox de renúncia ao direito de resolução.
   * `null` = este caso não tem checkbox (bilhete presencial: a exceção legal
   * vem de o evento ter data marcada, não de um consentimento expresso).
   */
  readonly checkbox: string | null;
};

/*
 * ⚠️ ENTRADAS PUBLICADAS NÃO SE EDITAM. Redação nova = versão nova.
 *
 * [VERIFICAR COM ADVOGADO] Confirmar se, para uma live comprada com
 * antecedência (antes de o stream arrancar), é preciso reforçar este texto com
 * a lógica da alínea l) do art. 17.º do DL 24/2014 (conteúdo digital com início
 * imediato) em vez de, ou a par de, a lógica de "serviço de lazer com data
 * marcada" (alínea k)). Enquanto isso não for confirmado, é mais seguro usar o
 * texto da opção C) também aqui, cumulativamente, se a compra for feita antes
 * do stream começar.
 *
 * (Se a resposta for "sim, cumulativamente", isto é uma entrada nova no
 * histórico com a checkbox do `vod` acrescentada ao `ppv` — não é uma edição
 * desta. As compras já feitas continuam a provar o que provaram.)
 */
const HISTORICO: Readonly<Record<string, Readonly<Record<ConsentKind, CopiaConsentimento>>>> = {
  "2026-07-19": {
    // A) Bilhete físico para evento presencial — informativo, sem checkbox.
    bilhete: {
      informativo: [
        "Este bilhete é para um evento com data e hora marcadas. Depois de confirmares o pagamento, não podes cancelar esta compra só por teres mudado de ideias — a lei não dá direito de arrependimento a bilhetes com data marcada. Guarda o teu QR: é ele que valida a entrada.",
        "Se o evento for cancelado, adiado, mudar de local ou tiver alterações relevantes ao cartaz anunciado, tens direito a reembolso.",
      ],
      checkbox: null,
    },
    // B) Acesso PPV a uma live com data marcada — informativo + checkbox.
    ppv: {
      informativo: [
        "Este acesso é a uma transmissão em direto, com data e hora marcadas. Por ser um serviço de lazer com data marcada, a compra é considerada definitiva assim que a confirmas — não há direito de arrependimento de 14 dias, tal como acontece com um bilhete de concerto.",
      ],
      checkbox:
        "Já percebi: depois de confirmar o pagamento, não posso cancelar esta compra por arrependimento.",
    },
    // C) Arquivo / VOD — só checkbox, e é a renúncia expressa aos 14 dias.
    vod: {
      informativo: [],
      checkbox:
        "Quero aceder a este vídeo imediatamente, ainda dentro do prazo em que teria direito a cancelar a compra (14 dias). Ao marcar esta opção, percebo que perco o direito de cancelar e ser reembolsado assim que o vídeo ficar disponível para mim.",
    },
  },
};

/** A redação de um caso numa dada versão. `null` = versão que nunca existiu. */
export function copiaConsentimento(
  kind: ConsentKind,
  versao: string = VERSAO_CONSENTIMENTO,
): CopiaConsentimento | null {
  return HISTORICO[versao]?.[kind] ?? null;
}

/** Este caso bloqueia o botão de pagamento até haver checkbox marcada? */
export function exigeCheckbox(kind: ConsentKind, versao: string = VERSAO_CONSENTIMENTO): boolean {
  return copiaConsentimento(kind, versao)?.checkbox != null;
}

/**
 * O pacote que viaja do servidor para o componente de checkout: o texto a
 * mostrar mais a etiqueta (`kind`, `versao`) que o cliente devolve no pedido.
 *
 * O cliente devolve a VERSÃO, não o texto — quem reconstrói o texto para a
 * prova é o servidor, a partir deste mesmo par. Assim ninguém forja a sua
 * própria prova de consentimento (ver o cabeçalho deste ficheiro).
 */
export type CopiaCliente = {
  kind: ConsentKind;
  versao: string;
  informativo: readonly string[];
  checkbox: string | null;
};

export function copiaCliente(
  kind: ConsentKind,
  versao: string = VERSAO_CONSENTIMENTO,
): CopiaCliente | null {
  const copia = copiaConsentimento(kind, versao);
  if (!copia) return null;
  return { kind, versao, informativo: copia.informativo, checkbox: copia.checkbox };
}

/**
 * O texto que fica guardado como prova.
 *
 * É **exatamente** o que apareceu no ecrã, pela ordem em que apareceu, com os
 * parágrafos separados por linha em branco. Nada acrescentado: nem rótulos
 * ("checkbox obrigatória:"), nem marcas de ✓/☐. Quem lê a linha na base de
 * dados lê as mesmas frases que o comprador leu.
 *
 * O que foi checkbox e o que foi informativo reconstrói-se pelo par
 * (`kind`, `text_version`) guardado na mesma linha; se foi marcada ou não está
 * na coluna `checkbox_accepted`. Cada coluna diz uma coisa só.
 */
export function textoDaProva(
  kind: ConsentKind,
  versao: string = VERSAO_CONSENTIMENTO,
): string | null {
  const copia = copiaConsentimento(kind, versao);
  if (!copia) return null;
  return [...copia.informativo, ...(copia.checkbox ? [copia.checkbox] : [])].join("\n\n");
}

/**
 * Que consentimento é que esta compra precisa.
 *
 * Não é escolha do browser — é uma propriedade do que está à venda, lida do
 * evento no servidor. Um evento terminado é arquivo: o vídeo já existe e fica
 * disponível de imediato, logo é a renúncia expressa aos 14 dias (opção C).
 * Tudo o resto é acesso a um direto com data marcada (opção B).
 */
export function tipoDeConsentimentoDoEvento(status: string): ConsentKind {
  return status === "ended" ? "vod" : "ppv";
}

// ── Validação (servidor) ────────────────────────────────────────────────────

export type ValidacaoConsentimento =
  | { ok: true; texto: string; versao: string; checkboxAceite: boolean | null }
  | { ok: false; erro: string };

/**
 * O corpo do pedido chega com uma versão e (talvez) uma checkbox marcada. Isto
 * decide se a compra pode avançar — e é a **única** decisão que conta, porque
 * o botão desativado no browser é conforto, não garantia: quem falar com a API
 * à mão não passa por ele.
 *
 * Devolve já o texto a gravar, para quem chama não ter de o ir buscar outra vez
 * (e não poder ir buscar um diferente).
 */
export function validarConsentimento(input: {
  kind: ConsentKind;
  versao: unknown;
  aceite: unknown;
}): ValidacaoConsentimento {
  if (typeof input.versao !== "string" || !input.versao) {
    return { ok: false, erro: "Recarrega a página antes de pagar — falta a confirmação legal." };
  }

  const copia = copiaConsentimento(input.kind, input.versao);
  if (!copia) {
    // Versão que este servidor não conhece: ou o pedido é forjado, ou o browser
    // tem uma página aberta de antes de um deploy que mudou a redação. Nos dois
    // casos a resposta é a mesma — recarregar mostra o texto em vigor.
    return { ok: false, erro: "O texto da compra foi atualizado. Recarrega a página, por favor." };
  }

  const texto = textoDaProva(input.kind, input.versao);
  if (texto === null) {
    return { ok: false, erro: "O texto da compra foi atualizado. Recarrega a página, por favor." };
  }

  if (copia.checkbox === null) {
    // Sem checkbox: `null` e não `false`. `false` quer dizer "mostrou-se e não
    // aceitou"; aqui não houve nada para aceitar.
    return { ok: true, texto, versao: input.versao, checkboxAceite: null };
  }

  if (input.aceite !== true) {
    return {
      ok: false,
      erro: "Marca a confirmação acima para poderes continuar.",
    };
  }

  return { ok: true, texto, versao: input.versao, checkboxAceite: true };
}
