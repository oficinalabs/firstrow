/*
 * ============================================================================
 *  O QUE O VÍDEO CUSTA — o eixo que a receita não mostra
 * ============================================================================
 *
 * A comissão escala com PAGANTES. A entrega de vídeo escala com ESPECTADORES.
 * São eixos diferentes, e o ecrã de ganhos só mostrava o primeiro: quem olha
 * para a receita descobre o segundo no fim do mês, na fatura da Cloudflare.
 *
 * Ordem de grandeza, com os números reais da SmokingBars — ~131 pagantes a
 * 8,50 € numa batalha de 3 h, toda a gente a ver tudo:
 *
 *     131 × 180 min = 23 580 min entregues ≈ 23,58 $
 *     comissão de 10 % sobre 1 113,50 € de receita = 111,35 €
 *
 * O vídeo come perto de um QUINTO da comissão. E a fração piora quanto mais
 * tempo as pessoas veem, porque um dos lados cresce com o tempo de visionamento
 * e o outro não cresce nada: vender o mesmo bilhete a alguém que vê 20 minutos
 * ou 3 horas dá a mesma comissão e custos de entrega nove vezes diferentes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  ESTE FICHEIRO É O ÚNICO SÍTIO ONDE OS PREÇOS VIVEM
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Tudo aqui é aritmética pura: sem I/O, sem `process.env`, sem base de dados.
 * É de propósito — as tarifas mudam, e quando mudarem a alteração tem de ser
 * uma linha num sítio, não uma caça a `/ 1000` espalhados por queries e JSX.
 *
 * A taxa de câmbio é o único número que NÃO tem um valor fixo aqui: entra como
 * argumento, resolvido por quem chama a partir do ambiente
 * (`resolveUsdToEur`). Ler `process.env` dentro deste ficheiro era um problema
 * silencioso — `lib/` também corre no browser, onde uma variável sem prefixo
 * `NEXT_PUBLIC_` chega a `undefined` e o cliente calcularia com uma taxa
 * diferente da do servidor, sem ninguém dar por isso.
 */

// ── Preçário do Cloudflare Stream ───────────────────────────────────────────

/*
 * Fonte: preçário público do Cloudflare Stream, consultado em 20/07/2026.
 * Não há plano gratuito (ver a nota em `server/cloudflare-stream.ts`, que
 * custou uma noite a descobrir).
 *
 * Se a Cloudflare mudar de preços, mudam-se estas duas linhas — e só estas.
 */

/**
 * ENTREGA: 1 $ por cada 1000 minutos entregues.
 *
 * A parte VARIÁVEL, e a que interessa por evento: escala com quantas pessoas
 * veem e durante quanto tempo. É esta que se compara com a comissão.
 */
export const DELIVERY_USD_PER_1000_MINUTES = 1;

/**
 * ARMAZENAMENTO: 5 $ por cada 1000 minutos guardados, pré-pago ao mês.
 *
 * Custo de CATÁLOGO, não de audiência: paga-se por ter o arquivo VOD lá, veja-o
 * quem o vir. Não entra na conta por evento — nenhuma tabela nossa sabe quantos
 * minutos de VOD cada evento ocupa (só temos o `cfVodUid`), e inventar uma
 * repartição seria pior do que não a dar. Quem sabe o total é a Cloudflare, em
 * `getStreamAccountStatus()`.
 */
export const STORAGE_USD_PER_1000_MINUTES = 5;

/** O bloco em que a Cloudflare cobra os dois preços acima. */
const BILLING_BLOCK_MINUTES = 1000;

/** Cêntimos numa unidade monetária. Dinheiro nesta app é sempre inteiro. */
const CENTS_PER_UNIT = 100;

// ── Regras da estimativa de minutos ─────────────────────────────────────────

/**
 * Teto por sessão, em minutos (12 h).
 *
 * Uma sessão que passe disto não é uma pessoa a ver: é um separador esquecido a
 * noite inteira, ou um relógio trocado (ver a nota sobre desvio de relógios em
 * `getDeliveryByEvent`). O teto troca uma possível SUBestimativa nesses casos
 * pela garantia de que uma linha absurda não domina o número todo — e as
 * sessões truncadas são contadas e mostradas, para que o corte nunca seja mudo.
 */
export const MAX_SESSION_MINUTES = 12 * 60;

// ── Câmbio ──────────────────────────────────────────────────────────────────

/**
 * Quantos euros vale um dólar. Valor de referência, revisto à mão.
 *
 * NÃO é uma cotação em tempo real e não deve passar a ser: o número a que se
 * aplica já é uma estimativa, e uma diferença de 5 % no câmbio não muda nenhuma
 * decisão que este ecrã sirva para tomar — o que muda decisões é a ordem de
 * grandeza (o vídeo come 5 % ou 60 % da comissão?). Ligar isto a uma API era
 * pagar uma dependência de rede na página do dinheiro para ganhar precisão
 * que ninguém usa.
 */
export const DEFAULT_USD_TO_EUR = 0.92;

/**
 * A taxa a usar, a partir do valor cru do ambiente (`USD_TO_EUR_RATE`).
 *
 * Pura e com o valor à entrada em vez de `process.env` lá dentro: é o que a
 * torna testável e o que impede o desencontro cliente/servidor descrito no topo.
 * Um valor inválido cai no de referência em vez de rebentar — um ecrã de ganhos
 * que não abre por causa de um câmbio mal escrito é pior do que um câmbio
 * aproximado, que é o que ele já é de qualquer forma.
 */
export function resolveUsdToEur(raw: string | undefined): number {
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 && rate <= 10 ? rate : DEFAULT_USD_TO_EUR;
}

// ── Custos ──────────────────────────────────────────────────────────────────

/** Minutos que não são um número, ou são negativos, valem zero. */
function safeMinutes(minutes: number): number {
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function costUsdCents(minutes: number, usdPer1000: number): number {
  return Math.round((safeMinutes(minutes) * usdPer1000 * CENTS_PER_UNIT) / BILLING_BLOCK_MINUTES);
}

/**
 * Minutos entregues → custo de entrega, em cêntimos de DÓLAR.
 *
 * Arredonda UMA vez, no fim. Ao contrário das taxas por transação do extrato
 * (`sum(round(...))` em `getMonthlyStatement`), aqui não há transação nenhuma
 * para arredondar: a Cloudflare fatura o total de minutos entregues na conta,
 * não sessão a sessão. Somar os minutos e converter uma vez é o que espelha a
 * fatura; arredondar por sessão inventava cêntimos que ninguém cobra.
 */
export function deliveryCostUsdCents(minutes: number): number {
  return costUsdCents(minutes, DELIVERY_USD_PER_1000_MINUTES);
}

/** Minutos armazenados → custo MENSAL de armazenamento, em cêntimos de dólar. */
export function storageCostUsdCents(minutes: number): number {
  return costUsdCents(minutes, STORAGE_USD_PER_1000_MINUTES);
}

/**
 * Cêntimos de dólar → cêntimos de euro.
 *
 * Existe para que a conversão seja UMA operação com nome, e não uma
 * multiplicação solta ao lado de cada número. Ver a decisão de moeda em
 * `eventEconomics`.
 */
export function usdCentsToEurCents(usdCents: number, usdToEur: number): number {
  return Math.round(usdCents * usdToEur);
}

// ── Saúde da margem ─────────────────────────────────────────────────────────

/**
 * Que fatia da comissão é que o vídeo come.
 *
 *   normal   — abaixo de 1/4
 *   atencao  — entre 1/4 e 1/2
 *   critico  — metade ou mais (inclui o caso de custar mais do que rende)
 */
export type MarginHealth = "normal" | "atencao" | "critico";

export const VIDEO_COST_WARNING_SHARE = 0.25;
export const VIDEO_COST_CRITICAL_SHARE = 0.5;

/**
 * A fração da comissão consumida pelo vídeo, ou `null` quando não há comissão
 * para dividir.
 *
 * `null` e não `0` nem `Infinity`: sem comissão a pergunta "que fatia?" não tem
 * resposta, e qualquer número que se devolvesse aqui aparecia no ecrã como se
 * fosse um facto medido.
 */
export function videoCostShare(videoCostCents: number, commissionCents: number): number | null {
  if (commissionCents <= 0) return null;
  return videoCostCents / commissionCents;
}

export function marginHealth(videoCostCents: number, commissionCents: number): MarginHealth {
  // Sem comissão mas com custo é o pior caso possível: entrega paga, zero a
  // entrar. Não pode ser "normal" só porque a divisão não dá.
  if (commissionCents <= 0) return videoCostCents > 0 ? "critico" : "normal";

  const share = videoCostCents / commissionCents;
  if (share >= VIDEO_COST_CRITICAL_SHARE) return "critico";
  if (share >= VIDEO_COST_WARNING_SHARE) return "atencao";
  return "normal";
}

// ── A conta de um evento ────────────────────────────────────────────────────

/** Minutos entregues de um evento, tal como saem da estimativa. */
export type DeliveryEstimate = {
  /** Sessões de visionamento com duração medida. */
  sessions: number;
  /** Minutos entregues (estimados). Ver `getDeliveryByEvent`. */
  minutes: number;
  /** Quantas sessões bateram no teto de `MAX_SESSION_MINUTES`. */
  cappedSessions: number;
};

export type EventEconomics = {
  revenueCents: number;
  /** O que a FirstRow leva. Arredondado POR COMPRA — ver a nota abaixo. */
  commissionCents: number;
  /** `null` = sem uma única sessão medida. Nunca zero: zero parece um facto. */
  minutes: number | null;
  videoCostUsdCents: number | null;
  videoCostEurCents: number | null;
  /** Comissão − custo de vídeo, em cêntimos de euro. */
  marginCents: number | null;
  costShare: number | null;
  health: MarginHealth | null;
};

/**
 * A conta de um evento: o que entrou, o que a plataforma leva, o que o vídeo
 * levou, e o que sobra.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  A COMISSÃO ARREDONDA-SE POR COMPRA, E ISSO NÃO É UM DETALHE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `compradores × round(preço × pct)` e NÃO `round(receita × pct)`. É o que o
 * split faz a cada pagamento (`lib/split.ts`) e o que o extrato mensal soma
 * (`sum(round(...))` em `getMonthlyStatement`). Com um preço cujo 10 % caia num
 * meio cêntimo, as duas fórmulas divergem — a 8,55 €, 131 compras dão 112,66 €
 * por compra e 112,01 € pela receita agregada. Uma diferença de 65 cêntimos
 * entre dois ecrãs que dizem a mesma coisa é o tipo de erro que ninguém
 * consegue explicar a uma liga.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  MOEDA: A CONTA É EM EURO, MAS O DÓLAR NÃO SE ESCONDE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A receita é EUR, a Cloudflare fatura USD. Havia duas saídas honestas:
 * mostrar o custo em USD e deixar a comparação ao leitor, ou converter e
 * assumir a aproximação. Escolheu-se CONVERTER — porque a pergunta que este
 * ecrã existe para responder ("o vídeo comeu que fatia da comissão?") é uma
 * divisão, e uma divisão entre moedas diferentes não é uma divisão.
 *
 * O que NÃO se faz é apagar o dólar: os dois valores viajam lado a lado
 * (`videoCostUsdCents` é o que a Cloudflare cobra mesmo, `videoCostEurCents` é
 * o derivado) e o ecrã mostra ambos, com a taxa usada escrita por baixo.
 * Converter em silêncio, com o símbolo € e mais nada, era o que seria enganador.
 */
export function eventEconomics(input: {
  buyers: number;
  unitPriceCents: number;
  commissionPct: number;
  delivery: DeliveryEstimate | null;
  usdToEur: number;
}): EventEconomics {
  const { buyers, unitPriceCents, commissionPct, delivery, usdToEur } = input;

  const revenueCents = buyers * unitPriceCents;
  const commissionCents = buyers * Math.round((unitPriceCents * commissionPct) / 100);

  // Sem sessões não há estimativa nenhuma a dar. Devolver zeros era afirmar
  // "este evento não custou nada", que é diferente de "não sabemos".
  if (!delivery || delivery.sessions === 0) {
    return {
      revenueCents,
      commissionCents,
      minutes: null,
      videoCostUsdCents: null,
      videoCostEurCents: null,
      marginCents: null,
      costShare: null,
      health: null,
    };
  }

  const videoCostUsdCents = deliveryCostUsdCents(delivery.minutes);
  const videoCostEurCents = usdCentsToEurCents(videoCostUsdCents, usdToEur);

  return {
    revenueCents,
    commissionCents,
    minutes: delivery.minutes,
    videoCostUsdCents,
    videoCostEurCents,
    marginCents: commissionCents - videoCostEurCents,
    costShare: videoCostShare(videoCostEurCents, commissionCents),
    health: marginHealth(videoCostEurCents, commissionCents),
  };
}

// ── Totais ──────────────────────────────────────────────────────────────────

export type EconomicsTotals = {
  revenueCents: number;
  commissionCents: number;
  /** Só dos eventos COM dados de visionamento. Ver a nota abaixo. */
  minutes: number;
  videoCostUsdCents: number;
  videoCostEurCents: number;
  marginCents: number;
  costShare: number | null;
  health: MarginHealth;
  /** Quantos eventos entraram sem uma única sessão medida. */
  eventsWithoutDelivery: number;
};

/**
 * Soma uma lista de eventos.
 *
 * ⚠️  A MARGEM TOTAL É UM LIMITE SUPERIOR quando há eventos sem dados de
 * visionamento: o custo desses não é zero, é desconhecido, e somá-lo como zero
 * dava uma margem melhor do que a real. Por isso `eventsWithoutDelivery` sai
 * daqui — para o ecrã poder dizer quantos são, em vez de apresentar um total
 * completo que não é.
 *
 * A soma é dos valores JÁ arredondados de cada evento, e não um novo cálculo
 * sobre os totais: é assim que a linha de total bate certo com a soma visível
 * das linhas de cima, ao cêntimo.
 */
export function totalEconomics(rows: readonly EventEconomics[]): EconomicsTotals {
  const totals = rows.reduce(
    (acc, row) => ({
      revenueCents: acc.revenueCents + row.revenueCents,
      commissionCents: acc.commissionCents + row.commissionCents,
      minutes: acc.minutes + (row.minutes ?? 0),
      videoCostUsdCents: acc.videoCostUsdCents + (row.videoCostUsdCents ?? 0),
      videoCostEurCents: acc.videoCostEurCents + (row.videoCostEurCents ?? 0),
      eventsWithoutDelivery: acc.eventsWithoutDelivery + (row.minutes === null ? 1 : 0),
    }),
    {
      revenueCents: 0,
      commissionCents: 0,
      minutes: 0,
      videoCostUsdCents: 0,
      videoCostEurCents: 0,
      eventsWithoutDelivery: 0,
    },
  );

  return {
    ...totals,
    marginCents: totals.commissionCents - totals.videoCostEurCents,
    costShare: videoCostShare(totals.videoCostEurCents, totals.commissionCents),
    health: marginHealth(totals.videoCostEurCents, totals.commissionCents),
  };
}
