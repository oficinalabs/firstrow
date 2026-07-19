/*
 * ============================================================================
 *  RATE LIMITING — o travão das rotas que se podem martelar
 * ============================================================================
 *
 * ⚠️  LIMITAÇÃO ASSUMIDA, NÃO ESCONDIDA
 *
 * Isto guarda os contadores EM MEMÓRIA, no processo. Na Vercel a app corre em
 * várias instâncias serverless em paralelo, cada uma com o seu `Map`, e uma
 * instância fria começa a contar do zero. O limite efetivo é, no pior caso,
 * `limite × nº de instâncias ativas` — e não há forma honesta de contornar
 * isso sem um contador partilhado (Redis/KV).
 *
 * Então porquê ter isto? Porque o que defende é real:
 *   • mata o ataque de força bruta de origem única, que é o caso comum
 *     (um script a martelar /sign-in/email do mesmo IP bate sempre na mesma
 *     instância enquanto ela estiver quente);
 *   • corta o pico de uma sessão de scanner encravada em loop;
 *   • põe o custo do ataque a subir sem introduzir infraestrutura nova.
 *
 * O que NÃO defende: um atacante distribuído por muitos IPs, ou paciente o
 * suficiente para esperar pelo reciclar das instâncias.
 *
 * QUANDO HOUVER KV/REDIS: trocar `hit()` por um INCR+EXPIRE atómico contra o
 * store partilhado. A superfície pública (`checkRateLimit`, `rateLimitResponse`)
 * foi desenhada para essa troca não tocar em nenhuma rota. Ver docs/SEGURANCA-APP.md.
 */

import { NextResponse } from "next/server";

/** Política de um limite: `max` pedidos por cada `windowMs`. */
export type RateLimitPolicy = {
  /** Pedidos permitidos dentro da janela. */
  max: number;
  /** Duração da janela, em milissegundos. */
  windowMs: number;
};

export type RateLimitResult = {
  /** O pedido pode seguir? */
  allowed: boolean;
  /** Quantos pedidos ainda cabem nesta janela. */
  remaining: number;
  /** Segundos até a janela reabrir (para o `Retry-After`). */
  retryAfterSeconds: number;
  /** A política aplicada — serve os cabeçalhos `RateLimit-*`. */
  policy: RateLimitPolicy;
};

/*
 * As políticas. Ficam todas aqui para se ver a postura da app num sítio só,
 * em vez de números mágicos espalhados pelas rotas.
 *
 * Os valores são propositadamente generosos para o uso legítimo e apertados
 * para o abuso: à porta de um evento, um staff valida um bilhete a cada 2-3
 * segundos em fila cheia — 30/min dá folga de sobra sem deixar enumerar QRs.
 */
export const RATE_LIMITS = {
  /** Entrar/registar: adivinhar passwords tem de custar caro. */
  auth: { max: 10, windowMs: 60_000 },
  /** Caminhos que disparam email (ativação, recuperação) — anti-spam. */
  authEmail: { max: 4, windowMs: 60_000 },
  /** Mint do token de reprodução: 1 play não precisa de 20 tokens/min. */
  playback: { max: 12, windowMs: 60_000 },
  /** Validação de QR à porta: rápido para a fila, lento para enumerar. */
  ticketValidate: { max: 30, windowMs: 60_000 },
  /** Iniciar pagamentos: evita encher a Eupago de referências órfãs. */
  checkout: { max: 8, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

// ── Armazenamento ───────────────────────────────────────────────────────────

type Bucket = {
  /** Início da janela atual (epoch ms). */
  windowStart: number;
  /** Pedidos contados nesta janela. */
  count: number;
};

/*
 * Teto de chaves em memória. Sem isto, um atacante a rodar o IP a cada pedido
 * fazia o `Map` crescer sem fim até a instância morrer por falta de memória —
 * o rate limiter passava a ser o próprio vetor de DoS.
 */
const MAX_KEYS = 10_000;

const buckets = new Map<string, Bucket>();

/** Pedidos desde a última limpeza — ver `sweep()`. */
let opsSinceSweep = 0;
const SWEEP_EVERY = 500;

/**
 * Limpa as janelas já expiradas.
 *
 * Disparada pelo VOLUME de chamadas, não por um `setInterval`: numa função
 * serverless a instância congela entre invocações e um temporizador pendurado
 * não tem garantia nenhuma de disparar a horas — só serve para segurar o
 * processo vivo. Contar operações funciona esteja a instância quente ou não.
 */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    // 5 min cobre a maior janela que usamos com folga.
    if (now - bucket.windowStart > 300_000) buckets.delete(key);
  }

  // Se ainda assim estiver cheio, o mais antigo sai primeiro (o `Map` do JS
  // preserva a ordem de inserção, por isso a primeira chave é a mais velha).
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

/**
 * Conta um pedido e diz se ele passa. Janela fixa com reinício preguiçoso:
 * simples, previsível, e sem o custo de guardar um log de timestamps por chave.
 */
function hit(key: string, policy: RateLimitPolicy, now: number): RateLimitResult {
  const existing = buckets.get(key);
  const expired = !existing || now - existing.windowStart >= policy.windowMs;

  const bucket: Bucket = expired ? { windowStart: now, count: 0 } : existing;
  bucket.count += 1;
  buckets.set(key, bucket);

  if (++opsSinceSweep >= SWEEP_EVERY || buckets.size > MAX_KEYS) {
    opsSinceSweep = 0;
    sweep(now);
  }

  const elapsed = now - bucket.windowStart;
  const allowed = bucket.count <= policy.max;

  return {
    allowed,
    remaining: Math.max(0, policy.max - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((policy.windowMs - elapsed) / 1000)),
    policy,
  };
}

// ── Identificação de quem faz o pedido ──────────────────────────────────────

/**
 * O IP do cliente, tal como a plataforma o vê.
 *
 * ORDEM DE CONFIANÇA — e ela importa, porque um limite que aceita um IP
 * forjado não limita nada:
 *
 *  1. `x-vercel-forwarded-for` — posto pela Vercel, nunca pelo cliente, e (ao
 *     contrário do seguinte) não é reescrito se um dia se puser um CDN à
 *     frente da app. É o mais fiável, por isso vem primeiro.
 *  2. `x-forwarded-for` — a Vercel DESCARTA o que o cliente enviar e reescreve
 *     o cabeçalho com o IP real na primeira posição, por isso é seguro hoje.
 *     Deixa de o ser se metermos outro proxy pelo meio — daí ser o plano B.
 *  3. `x-real-ip` — mesmo valor, só que já sem lista para partir.
 *
 * `NextRequest.ip` não entra na lista porque deixou de existir: foi removido
 * no Next 15 (vercel/next.js#68379).
 *
 * Em local não há proxy nenhum à frente e nada disto vem preenchido — cai em
 * "local" e todos os pedidos de desenvolvimento partilham o mesmo balde, que
 * é precisamente o que se quer para conseguir testar o limite à mão.
 */
export function clientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // "cliente, proxy1, proxy2" → o cliente é o primeiro.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return req.headers.get("x-real-ip")?.trim() || "local";
}

// ── Superfície pública ──────────────────────────────────────────────────────

/**
 * Verifica (e consome) uma unidade do limite.
 *
 * @param scope  nome da política, para não misturar baldes entre rotas
 * @param id     quem está a ser limitado (IP, id de utilizador, ou os dois)
 */
export function checkRateLimit(
  scope: keyof typeof RATE_LIMITS,
  id: string,
  policy: RateLimitPolicy = RATE_LIMITS[scope],
): RateLimitResult {
  return hit(`${scope}:${id}`, policy, Date.now());
}

/**
 * A resposta 429 — com os cabeçalhos que um cliente bem-comportado sabe ler.
 *
 * A mensagem é deliberadamente vaga: dizer "demasiadas tentativas para este
 * email" confirmaria a existência da conta a quem está a enumerar.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Demasiados pedidos. Espera um pouco e tenta outra vez." },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}

/**
 * Cabeçalhos da resposta 429.
 *
 * `Retry-After` é norma estável (RFC 9110 §10.2.3) — é o que interessa e vai
 * sempre. Os `X-RateLimit-*` não são norma nenhuma, mas são o formato que a
 * GitHub API e praticamente todo o tooling reconhecem à vista; o formato do
 * IETF que os vem substituir (`RateLimit: "default";r=…;t=…`) ainda está em
 * draft e mudou de forma entre versões, por isso ficamos pelo que se lê hoje.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.policy.max),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + result.retryAfterSeconds),
  };
}

/**
 * Atalho para o padrão mais comum numa rota: limita por IP e devolve já a
 * resposta 429 se estourou (ou `null` se pode seguir).
 *
 *   const limited = limitByIp(req, "playback");
 *   if (limited) return limited;
 */
export function limitByIp(
  req: Request,
  scope: keyof typeof RATE_LIMITS,
  suffix?: string,
): NextResponse | null {
  const id = suffix ? `${clientIp(req)}|${suffix}` : clientIp(req);
  const result = checkRateLimit(scope, id);
  return result.allowed ? null : rateLimitResponse(result);
}
