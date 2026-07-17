/*
 * Fonte ÚNICA de textos e números do marketing (taxas, comparações, contactos).
 * Nenhuma página/componente inventa ou repete estes valores — importam daqui.
 * Números reais: docs/VISAO-E-NEGOCIO.md (9 meses de payouts de uma liga PT,
 * ago 2025–abr 2026). Trocar um valor de taxa = mexer só neste ficheiro.
 */

/** Base pública do site (OG, sitemap, robots, canonical). */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://joinfirstrow.com").replace(
  /\/$/,
  "",
);

/** Contacto B2B (mailto). Domínio a verificar antes do lançamento — ver PR. */
export const CONTACT_EMAIL = "ola@joinfirstrow.com";

/** Constrói um mailto com assunto pré-preenchido. */
export function buildMailto(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Taxas e repartição — valores de docs/VISAO-E-NEGOCIO.md. */
export const taxas = {
  comissao: "10%",
  processamentoMbway: "~2%",
  custoTotalFirstRow: "~12%",
  custoTotalPatreon: "~23%",
  ficaFirstRow: "~88%",
  ficaPatreon: "~77%",
} as const;

/**
 * Lead honesto da secção de taxas — cita a fonte real, sem métricas inventadas.
 *
 * NÃO partir esta frase em template literals concatenados com `+`: o Turbopack
 * dobra a concatenação mal e come os pedaços estáticos (ver notas do PR). Uma
 * única template literal compila correto.
 */
export const taxasLead = `Numa liga portuguesa que acompanhámos durante 9 meses, o Patreon levou ${taxas.custoTotalPatreon} do bruto — entre taxa, processamento e conversão de moeda. A FirstRow fica-se pelos ${taxas.custoTotalFirstRow}, comissão e MB WAY incluídos. É a diferença entre guardares ${taxas.ficaPatreon} ou ${taxas.ficaFirstRow} do que vendes.`;

export const taxasNota =
  "Valores de mercado indicativos. A tua conta mostra sempre bruto → taxa → líquido, ao cêntimo.";

/** Cabeçalho da tabela comparativa. */
export const comparacaoColunas = ["FirstRow", "Membership típico", "Bilheteira típica"] as const;

type LinhaComparacao = {
  criterio: string;
  /** [FirstRow, Membership, Bilheteira] */
  valores: readonly [string, string, string];
};

/** Linhas da tabela comparativa (a 1ª coluna = FirstRow, destacada). */
export const comparacaoLinhas: readonly LinhaComparacao[] = [
  { criterio: "Comissão da plataforma", valores: [taxas.comissao, "8–12%", "—"] },
  {
    criterio: "Processamento de pagamento",
    valores: [`${taxas.processamentoMbway} (MB WAY)`, "+2–5% + câmbio", "1,50–3,00 €/bilhete"],
  },
  { criterio: "Fica para ti (em cada 10 €)", valores: ["~8,80 €", "~7,70 €", "varia"] },
  { criterio: "Lives PPV à prova de fugas", valores: ["sim", "não", "não"] },
  { criterio: "Bilhetes físicos + scanner de porta", valores: ["sim", "não", "sim"] },
  { criterio: "Pagamento a ti", valores: ["semanal", "mensal", "pós-evento"] },
] as const;

/** Categorias que a plataforma serve (tira editorial — não é wall de logos). */
export const categorias = ["Comédia", "Música", "Batalhas", "Esports", "Formação"] as const;

/** Os 3 passos do espectador (design da homepage). */
export const passosEspectador = [
  {
    titulo: "Compra com MB WAY",
    texto: "Sem cartão, sem conta nova. Confirmas na app e está feito.",
  },
  {
    titulo: "Vê onde quiseres",
    texto: "Telemóvel, portátil, TV. O acesso é da tua conta, não de um link.",
  },
  {
    titulo: "A porta fica fechada",
    texto: "1 sessão de cada vez e marca de água com o teu email. O que pagas, vale.",
  },
] as const;
