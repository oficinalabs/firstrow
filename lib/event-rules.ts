import { z } from "zod";
import { formatEuro } from "@/lib/format";

/*
 * Regras de um evento — puras, sem I/O, partilhadas pelo formulário e pelo
 * servidor. O cliente valida com isto para responder na hora; o servidor volta
 * a validar com isto porque o cliente nunca é fonte de verdade.
 *
 * (Mesma ideia do lib/password-policy.ts: a regra vive num sítio só.)
 */

const TIME_ZONE = "Europe/Lisbon";

/** Preço máximo por acesso — trava enganos de digitação e overflow do int4. */
const MAX_PRICE_CENTS = 100_000;

/**
 * Folga para o passado. O relógio do browser e o do servidor nunca são o mesmo,
 * e entre validar e gravar passa-se um pedido — sem isto, marcar um evento para
 * "daqui a 10 segundos" era recusado a meio do caminho.
 */
const CLOCK_TOLERANCE_MS = 60_000;

/**
 * Janela da guarda de duplicados: o mesmo título à mesma hora pedido duas vezes
 * dentro disto é um duplo-clique, não dois eventos.
 */
export const DUPLICATE_WINDOW_MS = 30_000;

export const eventFormSchema = z.object({
  title: z.string().trim().min(3, "Dá um título ao evento (pelo menos 3 caracteres)."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolhe a data."),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Escolhe a hora."),
  price: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, "Preço em euros — por exemplo, 7,50."),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;

/**
 * Erros por campo. `startsAt` é a data e a hora vistas em conjunto — "já
 * passou" não é culpa de nenhuma das duas sozinha, e aparece uma vez só.
 */
export type EventFieldErrors = Partial<Record<keyof EventFormValues | "startsAt", string>>;

/** Um evento pronto a gravar: já validado, já em cêntimos, já em instante UTC. */
export type EventDraft = { title: string; startsAt: Date; priceCents: number };

export const PAST_START_MESSAGE = "Essa hora já passou — escolhe uma futura.";

// ── Hora de Lisboa → instante ───────────────────────────────────────────────

/** Quanto é que a hora de parede de Lisboa está à frente do UTC neste instante. */
function lisbonOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wall - instant.getTime();
}

/**
 * "2026-07-26" + "21:00" (hora de Lisboa) → o instante correspondente.
 *
 * O produto é single-market: o dono escreve horas de Lisboa, quer o browser
 * esteja em Lisboa, no Brasil ou com o fuso trocado. Converter aqui — e não com
 * `new Date("...T...")`, que usa o fuso de quem corre o código — é o que faz o
 * cliente e o servidor chegarem exatamente ao mesmo instante.
 */
export function lisbonInstant(date: string, time: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const asDate = new Date(wall);
  // 31 de fevereiro: o Date.UTC normaliza em silêncio para 3 de março — recusa.
  if (asDate.getUTCMonth() !== month - 1 || asDate.getUTCDate() !== day) return null;

  // O offset depende do instante e o instante do offset; duas passagens chegam
  // ao ponto fixo (a segunda só muda algo na hora que a mudança de hora salta).
  const approx = wall - lisbonOffsetMs(asDate);
  return new Date(wall - lisbonOffsetMs(new Date(approx)));
}

/** Já passou? Com a folga de relógio — ver CLOCK_TOLERANCE_MS. */
export function isInThePast(startsAt: Date, now: Date = new Date()): boolean {
  return startsAt.getTime() <= now.getTime() - CLOCK_TOLERANCE_MS;
}

// ── Validação ───────────────────────────────────────────────────────────────

/** O que ficou escrito, em bruto — devolvido sempre para nada se perder. */
export function readEventFormValues(input: unknown): EventFormValues {
  const raw = (input ?? {}) as Record<string, unknown>;
  const text = (key: keyof EventFormValues) => (typeof raw[key] === "string" ? raw[key] : "");
  return { title: text("title"), date: text("date"), time: text("time"), price: text("price") };
}

export type EventValidation =
  | { ok: true; draft: EventDraft; values: EventFormValues }
  | { ok: false; errors: EventFieldErrors; values: EventFormValues };

/**
 * O que sobra de uma submissão: o que correu mal **e o que ficou escrito**.
 * Os valores viajam sempre de volta — nada do que o dono escreveu se perde por
 * um campo ter ficado em branco.
 */
export type EventFormState = {
  errors: EventFieldErrors;
  /** Erro que não é de nenhum campo em particular (permissões, servidor em baixo). */
  message: string;
  values: EventFormValues;
};

export const EMPTY_EVENT_FORM: EventFormState = {
  errors: {},
  message: "",
  values: { title: "", date: "", time: "", price: "" },
};

/**
 * Valida o formulário de evento de ponta a ponta. Chamada tal e qual no cliente
 * (feedback imediato) e no servidor (a que manda).
 */
export function validateEventForm(input: unknown, now: Date = new Date()): EventValidation {
  const values = readEventFormValues(input);
  const parsed = eventFormSchema.safeParse(values);

  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors;
    return {
      ok: false,
      values,
      errors: {
        title: fields.title?.[0],
        date: fields.date?.[0],
        time: fields.time?.[0],
        price: fields.price?.[0],
      },
    };
  }

  const startsAt = lisbonInstant(parsed.data.date, parsed.data.time);
  if (!startsAt) {
    return { ok: false, values, errors: { startsAt: "Esta data não existe — confirma o dia." } };
  }
  if (isInThePast(startsAt, now)) {
    return { ok: false, values, errors: { startsAt: PAST_START_MESSAGE } };
  }

  const priceCents = Math.round(Number(parsed.data.price.replace(",", ".")) * 100);
  if (priceCents <= 0) {
    return { ok: false, values, errors: { price: "O preço tem de ser maior que zero." } };
  }
  if (priceCents > MAX_PRICE_CENTS) {
    return {
      ok: false,
      values,
      errors: { price: `Preço a mais — o máximo é ${formatEuro(MAX_PRICE_CENTS)}.` },
    };
  }

  return { ok: true, values, draft: { title: parsed.data.title, startsAt, priceCents } };
}

// ── Ajudas para o formulário ────────────────────────────────────────────────

/** Hoje em Lisboa, no formato de `<input type="date">` — serve de `min`. */
export function todayInLisbon(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
