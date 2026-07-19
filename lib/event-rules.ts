import { z } from "zod";
// Só o TIPO da tabela: é apagado na compilação, por isso este ficheiro continua
// a poder correr no browser sem arrastar o driver do Postgres para o bundle.
// (Mesma divisão do lib/channels.ts.)
import type { events } from "@/db/schema";
import { formatEuro, formatNumber } from "@/lib/format";

/*
 * Regras de um evento — puras, sem I/O, partilhadas pelo formulário e pelo
 * servidor. O cliente valida com isto para responder na hora; o servidor volta
 * a validar com isto porque o cliente nunca é fonte de verdade.
 *
 * (Mesma ideia do lib/password-policy.ts: a regra vive num sítio só.)
 *
 * Criar e EDITAR passam os dois por aqui. A diferença entre os dois não é um
 * segundo conjunto de regras: é o contexto `editing`, que traz o evento como
 * está gravado e o que nele já não se pode mexer — ver `eventEditRules`.
 */

const TIME_ZONE = "Europe/Lisbon";

/** Preço máximo por acesso — trava enganos de digitação e overflow do int4. */
const MAX_PRICE_CENTS = 100_000;

/**
 * Lotação máxima de um recinto. Não é uma regra de negócio, é a mesma defesa do
 * preço: apanha o zero a mais antes de ele virar uma sala com 2 000 000 lugares.
 */
const MAX_TICKET_CAPACITY = 100_000;

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

/** Os estados por que um evento passa. `events.status` guarda um destes. */
export const EVENT_STATUSES = ["draft", "live", "ended"] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === "string" && (EVENT_STATUSES as readonly string[]).includes(value);
}

const PRICE_HINT = "Preço em euros — por exemplo, 7,50.";

export const eventFormSchema = z.object({
  title: z.string().trim().min(3, "Dá um título ao evento (pelo menos 3 caracteres)."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolhe a data."),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Escolhe a hora."),
  price: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, PRICE_HINT),
  /*
   * Bilhetes físicos. VAZIO É UM VALOR: quer dizer "este evento não vende
   * bilhetes à porta", que é o caso da maioria e o que `events.ticket_price_cents
   * = NULL` já significa em `server/tickets.ts`. Por isso o campo aceita a
   * cadeia vazia em vez de exigir um zero, que seria "vende, a 0 €".
   */
  ticketPrice: z
    .string()
    .trim()
    .regex(/^(\d+([.,]\d{1,2})?)?$/, PRICE_HINT),
  ticketCapacity: z
    .string()
    .trim()
    .regex(/^\d*$/, "Lotação em número de lugares — por exemplo, 200."),
});

/**
 * O que o formulário tem escrito — o schema mais o `canal`.
 *
 * O canal viaja com os outros campos (para não se perder numa submissão
 * falhada) mas **não é validado aqui**, e isso é deliberado: "este canal
 * existe e é teu?" é uma pergunta de PERMISSÃO, não de formato. Quem lhe
 * responde é `resolveChannelForNewEvent`, no servidor, a cada pedido. Pô-lo no
 * schema dava a ideia errada de que passar na validação basta para o evento
 * nascer no sítio certo.
 *
 * Em EDIÇÃO o canal nem sequer é lido: um evento não muda de canal (ver
 * `eventEditRules`).
 */
export type EventFormValues = z.infer<typeof eventFormSchema> & { canal: string };

/**
 * Erros por campo. `startsAt` é a data e a hora vistas em conjunto — "já
 * passou" não é culpa de nenhuma das duas sozinha, e aparece uma vez só.
 */
export type EventFieldErrors = Partial<Record<keyof EventFormValues | "startsAt", string>>;

/**
 * Falta escolher o canal.
 *
 * A mesma frase dos dois lados: o formulário di-la sem ir ao servidor, e o
 * servidor repete-a exatamente para quem submeta sem JS ou fale com a API à
 * mão. Duas redações da mesma recusa era o mesmo problema descrito de duas
 * maneiras — e a segunda parecia sempre um erro diferente.
 */
export const CHANNEL_REQUIRED_MESSAGE = "Escolhe o canal onde o evento vai nascer.";

/** Um evento pronto a gravar: já validado, já em cêntimos, já em instante UTC. */
export type EventDraft = {
  title: string;
  startsAt: Date;
  priceCents: number;
  /** `null` = este evento não vende bilhetes à porta. */
  ticketPriceCents: number | null;
  /** `null` = sem lotação declarada (vende sem teto). */
  ticketCapacity: number | null;
};

export const PAST_START_MESSAGE = "Essa hora já passou — escolhe uma futura.";

// ── O que um evento com vendas deixa de poder mudar ─────────────────────────

/*
 * ============================================================================
 *  EDITAR UM EVENTO QUE JÁ VENDEU
 * ============================================================================
 *
 * Editar um rascunho é trivial: ninguém pagou nada, muda-se tudo. O caso que
 * interessa acertar é o outro — e a resposta não é a mesma para todos os
 * campos, porque a base de dados não guarda o mesmo para todos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O PREÇO PPV É DIFERENTE DO PREÇO DO BILHETE, E ISSO NÃO É ARBITRÁRIO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `tickets.price_cents` é uma COLUNA DO BILHETE: `createPendingTicket` copia
 * para lá o preço que estava em vigor, e é essa cópia que o recibo, o extrato e
 * o total de `getEventTicketStats` usam. Mudar o preço do bilhete hoje não toca
 * em nada do que já se vendeu — só muda o que o próximo comprador paga.
 *
 * `entitlements` **não tem coluna nenhuma de preço**. Toda a receita PPV é
 * calculada com `events.price_cents` no momento em que se pergunta:
 * `getDashboardStats`, `listEventsWithSales`, `getMonthlyStatement`,
 * `listRecentPayments`, `listUserPurchases` (o que o comprador vê em /conta) e
 * `buildReceipt`. Ou seja: mudar o preço de um evento com acessos vendidos
 * **reescreve retroativamente** quanto é que essas pessoas pagaram, na nossa
 * contabilidade e no ecrã delas. Não é um risco teórico — está medido no
 * relatório desta frente.
 *
 * Enquanto não houver um `price_cents` em `entitlements`, a única forma honesta
 * de o preço não mudar o passado é o passado fechar o preço. É o que isto faz.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  A HORA MUDA-SE. O CANAL NÃO.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Adiar um evento é a razão nº 1 para editar, e proibi-lo era tornar o ecrã
 * inútil exactamente quando é preciso. Muda-se — mas quem comprou tem de saber,
 * e a plataforma ainda não avisa ninguém sozinha, por isso o ecrã diz-lhe isso à
 * cara antes de confirmar (ver `timeChangeConsequences`).
 *
 * O canal nunca. Mudá-lo levava o dinheiro do evento para outra liga e mudava
 * quem lhe pode mexer. Um evento no canal errado sem vendas apaga-se e cria-se;
 * com vendas, é um assunto para nós, não um campo de formulário.
 */

/** O que este evento já tem agarrado a si. É isto que fecha campos. */
export type EventCommitments = {
  status: EventStatus;
  /** Acessos PPV ativos ou reembolsados — quem pagou continua a contar. */
  ppvSales: number;
  /** Bilhetes já emitidos ou usados (um pendente ainda não é uma venda). */
  ticketsSold: number;
};

/**
 * Porque é que cada campo está fechado — ou `null` se ainda se mexe.
 *
 * As razões são texto pronto a mostrar de propósito: é a MESMA frase que o
 * formulário põe debaixo do campo desativado e que o servidor devolve a quem
 * tentar submetê-lo à mão. Duas redações da mesma recusa era o mesmo problema
 * descrito de duas maneiras.
 */
export type EventEditRules = {
  startsAt: string | null;
  price: string | null;
  /** Deixar de vender bilhetes de todo. */
  ticketsOff: string | null;
  /** A lotação não pode descer abaixo disto. Zero quando nada foi vendido. */
  minCapacity: number;
};

function counted(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${formatNumber(n)} ${plural}`;
}

export function eventEditRules(commitments: EventCommitments): EventEditRules {
  const { status, ppvSales, ticketsSold } = commitments;

  return {
    /*
     * A hora só se mexe enquanto o evento é rascunho. No ar, a hora de início
     * já é passado — mudá-la não adia coisa nenhuma, só desalinha a agenda e o
     * arquivo, que ordenam por ela. Terminado, é o registo de quando aconteceu.
     */
    startsAt:
      status === "live"
        ? "O evento está no ar — a hora de início já aconteceu e deixou de se mudar."
        : status === "ended"
          ? "O evento já terminou — a hora a que aconteceu fica como está."
          : null,

    price:
      status === "live"
        ? "O evento está no ar e pode estar a vender-se neste momento — o preço só se mexe fora do ar."
        : ppvSales > 0
          ? `Já há ${counted(ppvSales, "acesso vendido", "acessos vendidos")}. O que cada pessoa pagou é lido a partir deste preço, por isso mudá-lo reescrevia a receita já registada e o valor que aparece a quem comprou.`
          : null,

    ticketsOff:
      ticketsSold > 0
        ? `${counted(ticketsSold, "bilhete já emitido", "bilhetes já emitidos")} — tirar os bilhetes de venda deixava-os sem porta onde entrar.`
        : null,

    minCapacity: ticketsSold,
  };
}

/**
 * O que muda para quem já comprou, quando a hora do evento muda.
 *
 * Vive aqui, e não no diálogo, porque é a frase que o ecrã mostra ANTES de
 * confirmar — e a decisão que ela descreve (a plataforma não avisa ninguém
 * sozinha) é uma regra do produto, não uma escolha de layout.
 */
export function timeChangeConsequences(commitments: EventCommitments): string[] {
  const buyers = commitments.ppvSales + commitments.ticketsSold;
  if (buyers === 0) return [];
  return [
    `${counted(buyers, "pessoa já comprou", "pessoas já compraram")} para esta hora.`,
    "A FirstRow não as avisa sozinha — o aviso tem de partir de ti.",
    "A nova hora passa a aparecer no site, no recibo e na página do canal.",
  ];
}

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
  return {
    title: text("title"),
    date: text("date"),
    time: text("time"),
    price: text("price"),
    ticketPrice: text("ticketPrice"),
    ticketCapacity: text("ticketCapacity"),
    canal: text("canal"),
  };
}

/** Cêntimos → o que se escreve num campo de preço ("750" → "7,50"). */
export function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

/** "7,50" → 750. Só depois do schema ter garantido o formato. */
function inputToCents(value: string): number {
  return Math.round(Number(value.replace(",", ".")) * 100);
}

/**
 * A linha da base de dados reduzida ao que se edita.
 *
 * É o mesmo tipo que sai da validação, de propósito: o "antes" e o "depois" de
 * uma edição comparam-se campo a campo sem ninguém ter de os traduzir.
 */
export function eventToDraft(event: typeof events.$inferSelect): EventDraft {
  return {
    title: event.title,
    startsAt: event.startsAt,
    priceCents: event.priceCents,
    ticketPriceCents: event.ticketPriceCents,
    ticketCapacity: event.ticketCapacity,
  };
}

/** O evento gravado, nos mesmos campos que o formulário mostra. */
export function eventToFormValues(event: EventDraft): EventFormValues {
  const lisbon = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(event.startsAt);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    lisbon.find((p) => p.type === type)?.value ?? "";

  return {
    title: event.title,
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
    price: centsToInput(event.priceCents),
    ticketPrice: centsToInput(event.ticketPriceCents),
    ticketCapacity: event.ticketCapacity == null ? "" : String(event.ticketCapacity),
    // O canal de um evento não se edita — não há campo para ele em edição.
    canal: "",
  };
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
  /**
   * Para onde mandar quem perdeu a sessão a meio. Só vem preenchido nesse caso —
   * é o que transforma "a tua sessão expirou" num sítio onde carregar, em vez de
   * um beco com o formulário todo escrito e nenhuma saída.
   */
  signInHref?: string;
  values: EventFormValues;
};

export const EMPTY_EVENT_FORM: EventFormState = {
  errors: {},
  message: "",
  values: {
    title: "",
    date: "",
    time: "",
    price: "",
    ticketPrice: "",
    ticketCapacity: "",
    canal: "",
  },
};

/**
 * O contexto da validação.
 *
 * Sem `editing`, é uma criação. Com `editing`, é uma edição — e a diferença
 * está em duas coisas, ambas explicadas onde acontecem:
 *  - um campo fechado nunca é lido do pedido, vem do que está gravado;
 *  - "essa hora já passou" só se aplica se a hora tiver MUDADO.
 */
export type EventValidationContext = {
  now?: Date;
  editing?: { current: EventDraft; rules: EventEditRules };
};

/**
 * Valida o formulário de evento de ponta a ponta. Chamada tal e qual no cliente
 * (feedback imediato) e no servidor (a que manda).
 */
export function validateEventForm(
  input: unknown,
  context: EventValidationContext = {},
): EventValidation {
  const { now = new Date(), editing } = context;
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
        ticketPrice: fields.ticketPrice?.[0],
        ticketCapacity: fields.ticketCapacity?.[0],
      },
    };
  }

  const startsAt = lisbonInstant(parsed.data.date, parsed.data.time);
  if (!startsAt) {
    return { ok: false, values, errors: { startsAt: "Esta data não existe — confirma o dia." } };
  }

  /*
   * Um campo fechado NÃO É LIDO DO PEDIDO — vale o que está gravado.
   *
   * É a diferença entre "o formulário desativa o campo" (conforto) e "o valor
   * não pode vir do cliente" (garantia). Um `disabled` nem sequer submete o
   * campo, mas quem falar com a action à mão manda o que quiser — e chega aqui.
   *
   * Mandar um valor DIFERENTE do gravado não passa em silêncio: leva a razão do
   * fecho como erro do campo, que é a mesma frase que o ecrã já mostrava.
   */
  const rules = editing?.rules;
  const current = editing?.current;

  const wantedStart = startsAt.getTime();
  if (current && rules?.startsAt && wantedStart !== current.startsAt.getTime()) {
    return { ok: false, values, errors: { startsAt: rules.startsAt } };
  }
  const finalStartsAt = current && rules?.startsAt ? current.startsAt : startsAt;

  /*
   * "Essa hora já passou" só conta se a hora MUDOU.
   *
   * Sem isto, um rascunho cuja data ficou para trás não deixava corrigir o
   * título: a validação queixava-se de um campo em que ninguém tinha tocado, e o
   * ecrã ficava sem saída nenhuma.
   */
  const timeMoved = !current || finalStartsAt.getTime() !== current.startsAt.getTime();
  if (timeMoved && isInThePast(finalStartsAt, now)) {
    return { ok: false, values, errors: { startsAt: PAST_START_MESSAGE } };
  }

  const wantedPrice = inputToCents(parsed.data.price);
  if (current && rules?.price && wantedPrice !== current.priceCents) {
    return { ok: false, values, errors: { price: rules.price } };
  }
  const priceCents = current && rules?.price ? current.priceCents : wantedPrice;

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

  const ticketPriceCents = parsed.data.ticketPrice ? inputToCents(parsed.data.ticketPrice) : null;
  if (ticketPriceCents !== null && ticketPriceCents <= 0) {
    return {
      ok: false,
      values,
      errors: { ticketPrice: "Deixa em branco se este evento não vende bilhetes à porta." },
    };
  }
  if (ticketPriceCents !== null && ticketPriceCents > MAX_PRICE_CENTS) {
    return {
      ok: false,
      values,
      errors: { ticketPrice: `Preço a mais — o máximo é ${formatEuro(MAX_PRICE_CENTS)}.` },
    };
  }
  // Tirar os bilhetes de venda com bilhetes emitidos deixa quem os tem sem porta.
  if (ticketPriceCents === null && rules?.ticketsOff) {
    return { ok: false, values, errors: { ticketPrice: rules.ticketsOff } };
  }

  const ticketCapacity = parsed.data.ticketCapacity ? Number(parsed.data.ticketCapacity) : null;
  if (ticketCapacity !== null && ticketCapacity < 1) {
    return {
      ok: false,
      values,
      errors: { ticketCapacity: "Deixa em branco se não há teto de lugares." },
    };
  }
  if (ticketCapacity !== null && ticketCapacity > MAX_TICKET_CAPACITY) {
    return {
      ok: false,
      values,
      errors: {
        ticketCapacity: `Lotação a mais — o máximo é ${formatNumber(MAX_TICKET_CAPACITY)} lugares.`,
      },
    };
  }
  // Uma lotação abaixo do que já se vendeu é um recinto que já está em excesso.
  if (ticketCapacity !== null && rules && ticketCapacity < rules.minCapacity) {
    return {
      ok: false,
      values,
      errors: {
        ticketCapacity: `Já foram vendidos ${formatNumber(rules.minCapacity)} bilhetes — a lotação não pode ficar abaixo disso.`,
      },
    };
  }

  return {
    ok: true,
    values,
    draft: {
      title: parsed.data.title,
      startsAt: finalStartsAt,
      priceCents,
      ticketPriceCents,
      ticketCapacity,
    },
  };
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
