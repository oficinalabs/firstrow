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

/** Cêntimos → "8,59 €" (milhares com espaço: "2 244,00 €"). */
export function formatEuro(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.round(Math.abs(cents));
  const euros = groupThousands(String(Math.floor(abs / 100)));
  const centsPart = String(abs % 100).padStart(2, "0");
  return `${sign}${euros},${centsPart}${NBSP}€`;
}

/** 1204 → "1 204". */
export function formatNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  return sign + groupThousands(String(Math.round(Math.abs(value))));
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
