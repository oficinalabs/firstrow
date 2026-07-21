/*
 * ============================================================================
 *  RATE LIMITING — o travão das rotas que se podem martelar
 * ============================================================================
 *
 * Este ficheiro tem DOIS contadores, e a diferença entre eles é a diferença
 * entre "trava mesmo" e "trava enquanto a instância estiver quente". A escolha
 * do que cada rota usa está descrita ao fundo; aqui fica o que cada um GARANTE,
 * em números, para nunca ser descrito a uma liga como mais do que é.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  1. CONTADOR EM MEMÓRIA (`checkRateLimit`, `limitByIp`) — síncrono, legado
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Guarda os contadores num `Map` no processo. Na Vercel a app corre em VÁRIAS
 * instâncias serverless, cada uma com o SEU `Map`, e uma instância fria começa
 * do zero. O limite efetivo, no pior caso, é `max × nº de instâncias ativas`.
 * Foi medido nesta sessão que, na prática, isto é quase não-limite: basta o
 * pedido cair noutra instância para o contador recomeçar.
 *
 * O que ainda defende, e é real: um flood de ORIGEM ÚNICA contra uma instância
 * quente — o script que martela `/sign-in/email` do mesmo IP bate na mesma
 * instância enquanto ela durar, e aí `max` por janela é respeitado. Não defende
 * um atacante distribuído nem um paciente que espere o reciclar das instâncias.
 *
 * Continua aqui, síncrono, porque as rotas ainda o chamam sem `await`. Não faz
 * mal a ninguém: no pior caso não trava, nunca trava a mais.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  2. CONTADOR PARTILHADO EM POSTGRES (`checkRateLimitShared`, `limitByIpShared`)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O que SOBREVIVE ao serverless. O contador é UMA linha numa tabela, e cada
 * pedido — venha de que instância vier — faz um `INSERT … ON CONFLICT DO UPDATE`
 * atómico sobre essa linha. O `ON CONFLICT` tranca a linha, por isso dois
 * pedidos simultâneos incrementam em série e nunca leem o mesmo valor: o limite
 * é `max` por janela, GLOBAL, independente do nº de instâncias.
 *
 * GARANTIA, em números:
 *   • com `auth: max=10/min`, o 11.º pedido do mesmo IP dentro do minuto é
 *     recusado — esteja a app numa instância ou em cinquenta;
 *   • o teste `tests/integracao/rate-limit-partilhado.test.ts` dispara 20
 *     pedidos EM PARALELO contra o mesmo balde de `max=5` e mede exatamente 5
 *     aceites e 15 recusados, sobre ligações diferentes (a simular instâncias).
 *
 * O QUE CONTINUA A NÃO DEFENDER (e tem de se dizer): o limite é por CHAVE. Para
 * `limitByIpShared`, a chave é o IP — um atacante com mil IPs tem mil baldes de
 * `max` cada. Isso é inerente a limitar por IP, não uma falha do contador; a
 * defesa contra o distribuído é outra camada (WAF, prova de trabalho).
 *
 * CUSTO: uma ida à base de dados (um upsert por chave primária, indexado) por
 * pedido limitado. Só pesa nas rotas sensíveis que já falam com a BD de
 * qualquer forma (auth, checkout, playback, validação de bilhete), por isso a
 * ida extra é proporcionada. Se algum dia pesar, o caminho é um KV ao lado — a
 * superfície pública foi desenhada para essa troca não tocar em nenhuma rota.
 *
 * FALHA ABERTA, DE PROPÓSITO: se o contador partilhado estiver indisponível
 * (BD em baixo, tabela por criar), `checkRateLimitShared` NÃO tranca o pedido —
 * cai no contador em memória e regista o erro. Um limiter avariado não pode
 * derrubar os logins e o checkout do site inteiro; degradar para o de memória é
 * menos mau do que negar tudo. Ver `sharedHit`.
 *
 * A tabela é criada em RUNTIME (`ensureCounterTable`), com `create table if not
 * exists`, para esta mudança viver toda num ficheiro só, sem migração. Só nasce
 * quando uma rota adota o caminho partilhado — até lá, zero efeito em produção.
 */

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

/** Política de um limite: `max` pedidos por cada `windowMs`. */
export type RateLimitPolicy = {
  /** Pedidos permitidos dentro da janela. */
  max: number;
  /** Duração da janela, em milissegundos. */
  windowMs: number;
};

/**
 * De onde sai a CHAVE do balde — e isto é segurança, não arrumação.
 *
 *  - `"ip"`    — quem paga é a origem do pedido. É o certo quando ainda não há
 *                conta em que confiar (login, registo): travar por conta deixava
 *                um atacante trancar a conta alheia só com o email, que é
 *                público (*lockout-as-DoS*, OWASP Authentication Cheat Sheet).
 *  - `"conta"` — quem paga é a conta autenticada, SEM o IP pelo meio. É o certo
 *                quando o recurso protegido está preso à conta e não à rede: o
 *                token de reprodução, o pedido MB WAY, o scanner da porta.
 *
 * ⚠️ PORQUE É QUE O IP NÃO PODE ENTRAR NA CHAVE DE UM BALDE DE CONTA
 * Juntar o IP TORNA O BALDE MAIS FINO, logo mais PERMISSIVO: a mesma conta a
 * mudar de rede (dados móveis mudam de IP à vontade) ganha um balde novo a cada
 * salto. Num balde de `checkout` isso é literalmente multiplicar quantas vezes
 * se consegue fazer tocar o telemóvel de alguém; num de `playback`, é a fábrica
 * de tokens que o limite existia para fechar.
 */
export type FonteDaChave = "ip" | "conta";

/** Política + de onde sai a chave. É a tabela que manda, não o sítio que chama. */
type PoliticaComChave = RateLimitPolicy & { chave: FonteDaChave };

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
  /**
   * TENTATIVAS FALHADAS de credenciais. Só conta o que CORRE MAL — ver
   * `chargeFailedAttempt` e a nota do CGNAT em `app/api/auth/[...all]/route.ts`.
   *
   * 10 por minuto por IP é generoso para quem se engana a escrever a password e
   * hostil para quem a anda a adivinhar. Como o login BEM SUCEDIDO não gasta
   * nada, uma operadora móvel a esconder centenas de clientes atrás do mesmo IP
   * (CGNAT — o caso normal em Portugal) nunca esbarra nisto.
   */
  auth: { max: 10, windowMs: 60_000, chave: "ip" },
  /**
   * Caminhos que CRIAM ou DISPARAM alguma coisa para fora (registo, email de
   * ativação, recuperação). Aqui conta-se SEMPRE, com ou sem sucesso: o recurso
   * gasto é a conta criada ou o email enviado, e um pedido bem sucedido é
   * exatamente o abuso de que nos queremos defender.
   */
  authEmail: { max: 4, windowMs: 60_000, chave: "ip" },
  /** Mint do token de reprodução: 1 play não precisa de 20 tokens/min. */
  playback: { max: 12, windowMs: 60_000, chave: "conta" },
  /** Validação de QR à porta: rápido para a fila, lento para enumerar. */
  ticketValidate: { max: 30, windowMs: 60_000, chave: "conta" },
  /** Iniciar pagamentos: evita encher a Eupago de referências órfãs. */
  checkout: { max: 8, windowMs: 60_000, chave: "conta" },
  /**
   * Mensagens do chat. Limitado por CONTA (ver `CHAT_MESSAGES_PER_MINUTE` em
   * `server/chat.ts`): por IP punia quatro telemóveis atrás do mesmo NAT — uma
   * casa a ver a mesma batalha — e não travava quem trocasse de rede.
   */
  chat: { max: 12, windowMs: 60_000, chave: "conta" },
} as const satisfies Record<string, PoliticaComChave>;

/** Nome de um balde. */
export type RateLimitScope = keyof typeof RATE_LIMITS;

/*
 * Os baldes, separados por fonte de chave, para o COMPILADOR não deixar chamar
 * o atalho errado. `limitByAccountShared(… "auth" …)` não compila, e
 * `limitByIpShared(… "checkout" …)` também não — que é como se garante que a
 * tabela acima é a verdade, e não uma anotação que o código pode contradizer.
 * Foi essa contradição que esta frente encontrou: o documento dizia "conta" e o
 * código punha o IP na chave à mesma.
 */
type ScopePorFonte<F extends FonteDaChave> = {
  [K in RateLimitScope]: (typeof RATE_LIMITS)[K]["chave"] extends F ? K : never;
}[RateLimitScope];

/** Baldes cuja chave é o IP de quem pede. */
export type ScopeDeIp = ScopePorFonte<"ip">;
/** Baldes cuja chave é a conta autenticada. */
export type ScopeDeConta = ScopePorFonte<"conta">;

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

// ── Contador partilhado (Postgres) ──────────────────────────────────────────

/*
 * A tabela do contador. Criada em runtime, e de propósito: assim toda esta
 * mudança vive num ficheiro só, sem tocar em `db/schema.ts` nem nas migrações.
 * `create table if not exists` é idempotente e barato quando a tabela já existe
 * (é só uma consulta ao catálogo).
 */
let tabelaPronta: Promise<void> | null = null;

function ensureCounterTable(): Promise<void> {
  if (!tabelaPronta) {
    tabelaPronta = db
      .execute(
        sql`create table if not exists rate_limit_hits (
          key text primary key,
          window_started_at timestamptz not null default now(),
          count integer not null default 0
        )`,
      )
      .then(() => undefined)
      .catch((erro) => {
        // Deixa tentar outra vez no próximo pedido, em vez de guardar a falha.
        tabelaPronta = null;
        throw erro;
      });
  }
  return tabelaPronta;
}

/**
 * Conta um pedido contra a linha partilhada e diz se passa. Janela fixa com
 * reinício preguiçoso, tudo numa instrução atómica.
 *
 * O `ON CONFLICT DO UPDATE` tranca a linha antes de a reescrever, por isso dois
 * pedidos simultâneos — de duas instâncias — incrementam em série e leem contas
 * diferentes. É isto, e não o `Map` local, que faz o limite ser global.
 *
 * O `case` reinicia a janela quando a anterior já expirou: se `window_started_at`
 * é mais velho que a janela, o contador volta a 1 e a hora avança; senão soma 1
 * e mantém a hora — assim o `retryAfter` encolhe certo até ao fim da janela.
 */
async function sharedHit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
  await ensureCounterTable();

  const windowSecs = policy.windowMs / 1000;
  const linhas = await db.execute<{ count: number; decorrido_ms: number }>(sql`
    insert into rate_limit_hits as r (key, window_started_at, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case
        when r.window_started_at <= now() - make_interval(secs => ${windowSecs}) then 1
        else r.count + 1
      end,
      window_started_at = case
        when r.window_started_at <= now() - make_interval(secs => ${windowSecs}) then now()
        else r.window_started_at
      end
    returning
      count,
      (extract(epoch from (now() - window_started_at)) * 1000)::int as decorrido_ms
  `);

  const linha = linhas[0] as unknown as { count: number; decorrido_ms: number } | undefined;
  const count = Number(linha?.count ?? 1);
  const elapsed = Number(linha?.decorrido_ms ?? 0);

  // Limpeza probabilística: de vez em quando varre as janelas mortas para a
  // tabela não crescer sem fim com chaves de uso único (um IP por pedido). Sem
  // `await` — é manutenção, não pode atrasar a resposta nem derrubá-la se falhar.
  if (Math.random() < 0.01) {
    void db
      .execute(
        sql`delete from rate_limit_hits where window_started_at < now() - interval '10 minutes'`,
      )
      .catch(() => {});
  }

  return {
    allowed: count <= policy.max,
    remaining: Math.max(0, policy.max - count),
    retryAfterSeconds: Math.max(1, Math.ceil((policy.windowMs - elapsed) / 1000)),
    policy,
  };
}

/**
 * DEVOLVE ao balde uma unidade já cobrada.
 *
 * É a segunda metade do padrão "só o que falha custa": cobra-se SEMPRE à
 * entrada (atomicamente, que é o que faz o limite valer) e devolve-se se a
 * operação correr bem.
 *
 * ⚠️ PORQUE É QUE NÃO SE FAZ AO CONTRÁRIO — espreitar primeiro e só cobrar o que
 * falha. Foi tentado e MEDIDO nesta frente: 20 passwords erradas em paralelo
 * passaram TODAS as 20, porque uma leitura não tranca nada e as vinte leram
 * "balde vazio" no mesmo instante. Dava a um atacante uma rajada de tamanho
 * ilimitado por janela — precisamente o que o limite existe para impedir. O
 * `ON CONFLICT` do `sharedHit` não tem esse problema: serializa.
 *
 * O `greatest(…, 0)` impede uma devolução a mais de pôr a contagem negativa e
 * oferecer crédito de borla; a condição da janela impede devolver a um balde
 * que entretanto já reiniciou (aí a unidade a devolver já não existe).
 */
async function sharedRefund(key: string, policy: RateLimitPolicy): Promise<void> {
  const windowSecs = policy.windowMs / 1000;
  await db.execute(sql`
    update rate_limit_hits
    set count = greatest(count - 1, 0)
    where key = ${key}
      and window_started_at > now() - make_interval(secs => ${windowSecs})
  `);
}

// ── Superfície pública ──────────────────────────────────────────────────────

/*
 * ⚠️ NÃO HÁ AQUI NENHUM ATALHO PARA O CONTADOR EM MEMÓRIA, E É DE PROPÓSITO.
 *
 * Havia (`checkRateLimit`, `limitByIp`) e as cinco rotas sensíveis ficaram
 * agarradas a ele durante toda a vida do projeto — construiu-se o contador
 * partilhado, provou-se com uma medição, e ninguém o ligou. É o mesmo padrão
 * que já mordeu esta plataforma no `cfVodUid`.
 *
 * A defesa é estrutural e não uma nota: o `hit()` em memória deixou de ser
 * exportado. Hoje só se lá chega pela DEGRADAÇÃO de `checkRateLimitShared`
 * quando a base de dados não responde. Nenhuma rota o consegue usar por engano,
 * e nenhuma rota nova o pode adotar sem vir aqui abrir a porta de propósito.
 */

/** A chave completa de um balde. Um sítio só a formá-la, para não divergirem. */
function chaveDoBalde(scope: RateLimitScope, id: string): string {
  return `${scope}:${id}`;
}

/**
 * Como `checkRateLimit`, mas contra o contador PARTILHADO — o que vale entre
 * instâncias. É a versão a usar nas rotas sensíveis (ver `limitByIpShared`).
 *
 * FALHA ABERTA: se a base de dados não responder, cai no contador em memória e
 * regista o erro, em vez de negar o pedido. Um limiter avariado a trancar todos
 * os logins é pior do que um limiter degradado. Ver o cabeçalho do ficheiro.
 */
export async function checkRateLimitShared(
  scope: RateLimitScope,
  id: string,
  policy: RateLimitPolicy = RATE_LIMITS[scope],
): Promise<RateLimitResult> {
  const key = chaveDoBalde(scope, id);
  try {
    return await sharedHit(key, policy);
  } catch (erro) {
    console.error("[rate-limit] contador partilhado indisponível, uso o de memória:", erro);
    return hit(key, policy, Date.now());
  }
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
 * Limita POR IP, contra o contador partilhado. Devolve já a resposta 429 se
 * estourou, ou `null` se o pedido pode seguir.
 *
 *   const limited = await limitByIpShared(req, "authEmail", "/forget-password");
 *   if (limited) return limited;
 *
 * @param sufixo discrimina baldes do mesmo IP (o CAMINHO, no Better Auth):
 *   gastar as tentativas de login não deve impedir a pessoa de pedir um email
 *   de recuperação.
 */
export async function limitByIpShared(
  req: Request,
  scope: ScopeDeIp,
  sufixo?: string,
): Promise<NextResponse | null> {
  const id = sufixo ? `${clientIp(req)}|${sufixo}` : clientIp(req);
  const result = await checkRateLimitShared(scope, id);
  return result.allowed ? null : rateLimitResponse(result);
}

/**
 * Limita POR CONTA, contra o contador partilhado. O IP não entra na chave — ver
 * a nota em `FonteDaChave` para o porquê de o juntar ser MAIS permissivo, não
 * mais seguro.
 *
 *   const limited = await limitByAccountShared("checkout", gate.user.id);
 *   if (limited) return limited;
 */
export async function limitByAccountShared(
  scope: ScopeDeConta,
  contaId: string,
): Promise<NextResponse | null> {
  const result = await checkRateLimitShared(scope, contaId);
  return result.allowed ? null : rateLimitResponse(result);
}

/**
 * Devolve ao balde a unidade cobrada por `limitByIpShared`, porque a operação
 * acabou por correr BEM.
 *
 * É o que torna um limite por IP compatível com o CGNAT das operadoras móveis:
 * quem acerta na password não deixa rasto no contador, por isso uma multidão
 * legítima atrás do mesmo IPv4 nunca o enche. Só quem falha acumula.
 *
 * NUNCA REBENTA O PEDIDO: a resposta ao cliente já está decidida quando isto
 * corre. Uma devolução perdida só torna o limite ligeiramente mais severo para
 * aquele IP durante o resto da janela, o que é o lado seguro para falhar.
 */
export async function refundAttempt(
  req: Request,
  scope: ScopeDeIp,
  sufixo?: string,
): Promise<void> {
  const id = sufixo ? `${clientIp(req)}|${sufixo}` : clientIp(req);
  try {
    await sharedRefund(chaveDoBalde(scope, id), RATE_LIMITS[scope]);
  } catch (erro) {
    console.error("[rate-limit] devolução ao contador partilhado falhou:", erro);
  }
}
