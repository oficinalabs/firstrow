/*
 * Formatadores partilhados (PT-PT). Todas as frentes formatam euros, datas,
 * números e telefones SÓ por aqui — nunca à mão nas páginas.
 * Produto single-market: horas sempre em Europe/Lisbon.
 */

const TIME_ZONE = "Europe/Lisbon";
const LOCALE = "pt-PT";
const NBSP = " ";

// Agrupamento manual (o CLDR pt-PT só agrupa a partir de 5 dígitos; o design
// quer "2 244,00 €") — e output idêntico em qualquer runtime/ICU.
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

// Pontuação PT-PT para qualquer moeda: vírgula decimal, milhares com espaço,
// símbolo no fim depois de um espaço inquebrável.
function formatMoney(cents: number, symbol: string): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.round(Math.abs(cents));
  const units = groupThousands(String(Math.floor(abs / 100)));
  const decimals = String(abs % 100).padStart(2, "0");
  return `${sign}${units},${decimals}${NBSP}${symbol}`;
}

/** Cêntimos → "8,59 €" (milhares com espaço: "2 244,00 €"). */
export function formatEuro(cents: number): string {
  return formatMoney(cents, "€");
}

/**
 * Cêntimos de dólar → "23,58 $".
 *
 * A Cloudflare fatura em USD (ver `lib/video-costs.ts`). O símbolo é diferente
 * de propósito: pôr "€" num valor que ninguém converteu era dizer que já estava
 * convertido, e é exatamente essa a confusão que o ecrã de custos tem de evitar.
 */
export function formatUsd(cents: number): string {
  return formatMoney(cents, "$");
}

/** 1204 → "1 204". */
export function formatNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  return sign + groupThousands(String(Math.round(Math.abs(value))));
}

/**
 * Fração → percentagem INTEIRA: 0.195 → "20 %".
 *
 * Para proporções medidas, onde as casas decimais são ruído: o peso do vídeo na
 * comissão, a conversão de uma coorte. ⚠️ NÃO serve para TAXAS CONTRATADAS
 * abaixo de 1 % — arredonda-as para o inteiro mais próximo. Ver `formatRate`.
 */
export function formatPercent(fraction: number): string {
  return `${formatNumber(fraction * 100)}${NBSP}%`;
}

/**
 * Fração → percentagem com casas decimais: 0.007 → "0,7 %".
 *
 * Existe por causa de um erro medido nesta base de código: a taxa da Eupago
 * (0,7 % por transação) foi escrita com `formatPercent` e saiu **"1 %"** — uma
 * taxa 43 % maior do que a real, impressa por baixo da tabela do extrato, que
 * existe precisamente para uma liga conferir o que lhe é devido ao cêntimo.
 *
 * A regra: `formatPercent` para o que se MEDE, `formatRate` para o que se
 * CONTRATA. Um número que aparece num contrato não pode ser arredondado pelo
 * formatador.
 */
export function formatRate(fraction: number, places = 1): string {
  return `${formatDecimal(fraction * 100, places)}${NBSP}%`;
}

/**
 * Decimal com vírgula e casas fixas: 0.92 → "0,92".
 *
 * Para os poucos números que não são dinheiro nem contagens — hoje a taxa de
 * câmbio. Sem isto ia para o ecrã o `String(0.92)` do JavaScript, com ponto
 * decimal, no meio de uma frase em português.
 */
export function formatDecimal(value: number, places = 2): string {
  const sign = value < 0 ? "-" : "";
  const [whole, decimals] = Math.abs(value).toFixed(places).split(".");
  return `${sign}${groupThousands(whole)}${decimals ? `,${decimals}` : ""}`;
}

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function datePart(date: Date, options: Intl.DateTimeFormatOptions, part: string): string {
  const parts = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, ...options })
    .formatToParts(date)
    .find((p) => p.type === part);
  // pt-PT abrevia com ponto ("jul.", "sáb.") — o design usa "jul"/"sáb".
  return (parts?.value ?? "").replace(/\./g, "");
}

/** "12 jul" — junta o ano só quando não é o ano corrente ("12 jul 2027"). */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  const day = datePart(date, { day: "numeric" }, "day");
  const month = datePart(date, { month: "short" }, "month");
  const year = datePart(date, { year: "numeric" }, "year");
  const currentYear = datePart(new Date(), { year: "numeric" }, "year");
  return year === currentYear ? `${day} ${month}` : `${day} ${month} ${year}`;
}

/** "21:00". */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  const hour = datePart(date, { hour: "2-digit", hour12: false }, "hour");
  const minute = datePart(date, { minute: "2-digit" }, "minute");
  return `${hour}:${minute.padStart(2, "0")}`;
}

/** "sáb 26 jul · 21:00" (uppercase é responsabilidade do CSS, ex.: badges). */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  // pt-PT não abrevia o weekday no CLDR ("domingo" mesmo em short);
  // os 3 primeiros caracteres dão dom/seg/ter/qua/qui/sex/sáb.
  const weekday = datePart(date, { weekday: "long" }, "weekday").slice(0, 3);
  return `${weekday} ${formatDate(date)} · ${formatTime(date)}`;
}

/** "912345678" | "+351 912-345-678" → "912 345 678". */
export function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("351")) {
    digits = digits.slice(3);
  }
  const groups = digits.match(/.{1,3}/g);
  return groups ? groups.join(" ") : digits;
}
