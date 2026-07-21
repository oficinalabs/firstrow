import "dotenv/config";
import postgres from "postgres";
import { emParalelo } from "../tests/apoio/paralelo";

/*
 * ============================================================================
 *  O LIMITE, MEDIDO CONTRA AS ROTAS A SÉRIO
 * ============================================================================
 *
 *   node scripts/servidor-medicao-frente-x.mjs      ← noutro terminal, 3016
 *   pnpm dlx tsx scripts/medir-rate-limit-ligado.ts
 *
 * PORQUE É QUE ISTO EXISTE, quando já há um teste de integração do contador:
 * o teste prova que `checkRateLimitShared` conta bem. NÃO prova que alguma rota
 * o chama. Foi precisamente esse o buraco — o contador partilhado esteve
 * construído e provado durante toda uma frente, e as cinco rotas continuaram
 * agarradas ao de memória, que em serverless não limita nada. Um teste verde e
 * uma plataforma sem limite ao mesmo tempo.
 *
 * Por isso aqui não se importa nada de `lib/`: fala-se HTTP com o build de
 * produção, exatamente como um atacante faria, e CONTAM-SE AS RESPOSTAS.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  NÃO SE COBRA NADA A NINGUÉM
 * ────────────────────────────────────────────────────────────────────────────
 * O `eventId` usado é um UUID que não existe. Nas quatro rotas de conta o
 * limite corre ANTES do `getEvent`, por isso o que passa leva 404 e o que é
 * travado leva 429 — e a Eupago nunca é contactada. Nenhum telemóvel toca.
 */

const BASE = process.env.MEDICAO_BASE ?? "http://localhost:3016";
const PASSWORD = "Batalha-Rap-2026-segura";
const EVENTO_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

/*
 * ⚠️ A MESMA BASE QUE O SERVIDOR, e não a de desenvolvimento.
 *
 * Isto começou por importar o `@/db`, que abre o `DATABASE_URL` — mas o
 * `servidor-medicao-frente-x.mjs` corre contra o `TEST_DATABASE_URL`. O
 * `truncate` limpava uma base e o servidor contava noutra, por isso os baldes
 * nunca eram limpos entre fases e TUDO dava 429 a partir da segunda medição.
 * Parecia o limite a funcionar bem de mais; era o harness a medir a base errada.
 */
const BASE_DE_DADOS = process.env.TEST_DATABASE_URL;
if (!BASE_DE_DADOS) throw new Error("TEST_DATABASE_URL em falta no .env");
const nomeDaBase = new URL(BASE_DE_DADOS).pathname.replace(/^\//, "");
if (!/test/i.test(nomeDaBase) || nomeDaBase.toLowerCase() === "neondb") {
  throw new Error(`RECUSADO: "${nomeDaBase}" não é uma base descartável.`);
}
const sql = postgres(BASE_DE_DADOS, { prepare: false, max: 4, onnotice: () => {} });

/** Limites reais, tal como estão em `lib/rate-limit.ts`. Espelhados aqui de
 *  propósito: se alguém lá mudar um número sem mudar aqui, a medição acusa. */
const ESPERADO = { checkout: 8, playback: 12, ticketValidate: 30, auth: 10 } as const;

type Resposta = { status: number };

async function pedir(
  caminho: string,
  opcoes: { cookie?: string; ip?: string; corpo?: unknown; metodo?: string } = {},
): Promise<Resposta> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: BASE };
  if (opcoes.cookie) headers.cookie = opcoes.cookie;
  // Simula o cabeçalho que a Vercel põe — é o que `clientIp()` lê primeiro.
  if (opcoes.ip) headers["x-vercel-forwarded-for"] = opcoes.ip;

  const res = await fetch(`${BASE}${caminho}`, {
    method: opcoes.metodo ?? "POST",
    headers,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });
  return { status: res.status };
}

/**
 * Limpa o contador partilhado para cada medição começar do zero.
 *
 * A tabela é criada em RUNTIME pela app (`ensureCounterTable`), por isso aqui
 * só se limpa — e se ela ainda não existir é porque nenhuma rota lhe tocou,
 * que é exatamente o que a asserção final apanha.
 */
async function limparContador(): Promise<void> {
  await sql`truncate table rate_limit_hits`.catch(() => {});
}

async function criarConta(email: string, ip: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-vercel-forwarded-for": ip },
    body: JSON.stringify({ email, password: PASSWORD, name: email.split("@")[0] }),
  });
  if (!res.ok) throw new Error(`sign-up falhou (${res.status}): ${await res.text()}`);
  return email;
}

async function entrar(email: string, ip: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-vercel-forwarded-for": ip },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in falhou (${res.status}): ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (cookie.length === 0) throw new Error("sign-in não devolveu cookie");
  return cookie.join("; ");
}

const falhas: string[] = [];

function conferir(rotulo: string, obtido: number, esperado: number): void {
  const ok = obtido === esperado;
  if (!ok) falhas.push(`${rotulo}: esperado ${esperado}, obtido ${obtido}`);
  console.info(`  ${ok ? "✓" : "✗"} ${rotulo}: ${obtido} (esperado ${esperado})`);
}

/** Dispara `n` pedidos em paralelo e conta quantos NÃO levaram 429. */
async function quantosPassaram(
  n: number,
  fazer: (i: number) => Promise<Resposta>,
): Promise<{ passaram: number; travados: number; estados: Record<number, number> }> {
  const res = await emParalelo(n, fazer);
  const estados: Record<number, number> = {};
  let passaram = 0;
  let travados = 0;
  for (const r of res) {
    if (r.status !== "fulfilled") {
      falhas.push(`pedido rebentou: ${r.reason}`);
      continue;
    }
    estados[r.value.status] = (estados[r.value.status] ?? 0) + 1;
    if (r.value.status === 429) travados += 1;
    else passaram += 1;
  }
  return { passaram, travados, estados };
}

async function main() {
  console.info(`Alvo: ${BASE}\n`);

  // Do zero: senão a corrida anterior deixa baldes cheios e o registo falha.
  await limparContador();

  const marca = Date.now().toString(36);
  const emailA = `medicao-a-${marca}@firstrow.dev`;
  const emailB = `medicao-b-${marca}@firstrow.dev`;

  await criarConta(emailA, "10.0.0.1");
  await criarConta(emailB, "10.0.0.2");
  const cookieA = await entrar(emailA, "10.0.0.1");
  const cookieB = await entrar(emailB, "10.0.0.2");
  console.info("Duas contas criadas e autenticadas.\n");

  // ── 1. As três rotas de conta, com pedidos em paralelo ────────────────────
  const rotas = [
    {
      nome: "POST /api/checkout/[id]",
      caminho: `/api/checkout/${EVENTO_INEXISTENTE}`,
      max: ESPERADO.checkout,
      corpo: { phone: "910000000" },
    },
    {
      nome: "POST /api/playback/[id]/session",
      caminho: `/api/playback/${EVENTO_INEXISTENTE}/session`,
      max: ESPERADO.playback,
      corpo: undefined,
    },
    {
      nome: "POST /api/tickets/validate",
      caminho: "/api/tickets/validate",
      max: ESPERADO.ticketValidate,
      corpo: { code: "frt_inexistente", eventId: EVENTO_INEXISTENTE },
    },
  ];

  for (const rota of rotas) {
    await limparContador();
    const disparos = rota.max + 12;
    console.info(`${rota.nome} — ${disparos} pedidos em paralelo, limite ${rota.max}`);
    const r = await quantosPassaram(disparos, () =>
      pedir(rota.caminho, { cookie: cookieA, corpo: rota.corpo, ip: "10.0.0.1" }),
    );
    console.info(`  estados: ${JSON.stringify(r.estados)}`);
    conferir("passaram", r.passaram, rota.max);
    conferir("travados (429)", r.travados, disparos - rota.max);
    console.info("");
  }

  // ── 2. A CORREÇÃO DA CHAVE: mudar de IP já não dá balde novo ──────────────
  /*
   * Esta é a medição da correção. A chave era `IP|conta`; agora é só a conta.
   * Vinte pedidos da MESMA conta, cada um a dizer que vem de um IP DIFERENTE
   * (é o que faz quem está em dados móveis, ou quem usa uma lista de proxies).
   * Com a chave antiga cada IP tinha o seu balde e passavam os vinte.
   */
  await limparContador();
  console.info("MESMA conta, 20 IPs diferentes — POST /api/checkout/[id], limite 8");
  const rotativo = await quantosPassaram(20, (i) =>
    pedir(`/api/checkout/${EVENTO_INEXISTENTE}`, {
      cookie: cookieA,
      corpo: { phone: "910000000" },
      ip: `203.0.113.${i + 1}`,
    }),
  );
  console.info(`  estados: ${JSON.stringify(rotativo.estados)}`);
  conferir("passaram (rotação de IP não ajuda)", rotativo.passaram, ESPERADO.checkout);
  console.info("");

  // ── 3. CONTROLO POSITIVO: outra conta tem o seu próprio balde ─────────────
  /*
   * Sem isto, os zeros acima podiam ser só "está tudo a dar 429". A conta B,
   * com o balde de A esgotado, tem de passar os seus 8.
   */
  console.info("CONTROLO — conta B, com o balde de A esgotado, limite 8");
  const contaB = await quantosPassaram(20, () =>
    pedir(`/api/checkout/${EVENTO_INEXISTENTE}`, {
      cookie: cookieB,
      corpo: { phone: "910000000" },
      ip: "10.0.0.1",
    }),
  );
  console.info(`  estados: ${JSON.stringify(contaB.estados)}`);
  conferir("passaram (balde próprio)", contaB.passaram, ESPERADO.checkout);
  console.info("");

  // ── 4. AUTENTICAÇÃO: só as tentativas FALHADAS custam ─────────────────────
  await limparContador();
  console.info(`POST /api/auth/sign-in/email — 20 passwords ERRADAS, limite ${ESPERADO.auth}`);
  const erradas = await quantosPassaram(20, () =>
    pedir("/api/auth/sign-in/email", {
      corpo: { email: emailA, password: "password-errada-de-propósito" },
      ip: "198.51.100.7",
    }),
  );
  console.info(`  estados: ${JSON.stringify(erradas.estados)}`);
  /*
   * ⚠️ ESTA É A ASSERÇÃO QUE APANHOU O BURACO DA PRIMEIRA VERSÃO.
   *
   * Com o padrão "espreitar e só cobrar o que falha", as 20 passavam as 20: uma
   * leitura não tranca nada e as vinte liam "balde vazio" no mesmo instante.
   * Uma rajada de tamanho ilimitado por janela, no endpoint de login.
   *
   * Com "cobrar à entrada e devolver no sucesso", a cobrança é o `INSERT … ON
   * CONFLICT` atómico e a fronteira é exata mesmo em paralelo: 10 e não mais.
   */
  conferir("tentativas falhadas aceites (em paralelo)", erradas.passaram, ESPERADO.auth);
  conferir("travadas (429)", erradas.travados, 20 - ESPERADO.auth);
  console.info("");

  // Em série, a fronteira é exata: 10 falhas passam, a 11.ª leva 429.
  await limparContador();
  console.info(`POST /api/auth/sign-in/email — falhas EM SÉRIE, limite ${ESPERADO.auth}`);
  let falhasAteBloquear = 0;
  for (let i = 0; i < ESPERADO.auth + 5; i++) {
    const r = await pedir("/api/auth/sign-in/email", {
      corpo: { email: emailA, password: "password-errada-de-propósito" },
      ip: "198.51.100.8",
    });
    if (r.status === 429) break;
    falhasAteBloquear += 1;
  }
  conferir("falhas aceites antes do 429", falhasAteBloquear, ESPERADO.auth);
  console.info("");

  // ── 4b. O contador está mesmo na base de dados (não em memória) ───────────
  /*
   * A prova de que quem travou acima foi o contador PARTILHADO e não o `Map` do
   * processo. Tem de estar aqui, logo a seguir a uma fase que COBRA: se fosse
   * no fim, depois da fase dos logins certos, a tabela estaria legitimamente
   * vazia (o sucesso devolve tudo) e a asserção acusava um falso problema —
   * como aconteceu na primeira corrida desta medição.
   */
  const linhasAgora = await sql<
    { key: string; count: number }[]
  >`select key, count from rate_limit_hits order by key`;
  console.info(`Linhas em rate_limit_hits depois das falhas: ${linhasAgora.length}`);
  for (const l of linhasAgora) console.info(`  ${l.key} → ${l.count}`);
  if (linhasAgora.length === 0) {
    falhas.push("rate_limit_hits vazia — o contador partilhado não está a ser usado");
  }
  console.info("");

  // ── 5. O CGNAT: logins BEM SUCEDIDOS não gastam o balde ───────────────────
  /*
   * A razão de ser do "só conta o que falha". 40 logins certos do MESMO IP —
   * a operadora móvel a esconder 40 clientes atrás do mesmo IPv4 na noite de um
   * evento. Se o sucesso contasse, o 11.º levava 429 e 30 pessoas que pagaram
   * ficavam de fora. Tem de passar toda a gente.
   */
  await limparContador();
  const LOGINS = 40;
  console.info(`POST /api/auth/sign-in/email — ${LOGINS} logins CERTOS do mesmo IP (CGNAT)`);
  let bloqueados = 0;
  for (let i = 0; i < LOGINS; i++) {
    const r = await pedir("/api/auth/sign-in/email", {
      corpo: { email: emailA, password: PASSWORD },
      ip: "198.51.100.9",
    });
    if (r.status === 429) bloqueados += 1;
  }
  conferir("logins certos travados", bloqueados, 0);
  console.info("");

  /*
   * E o reverso, que é a prova direta de que o sucesso não custa nada: depois
   * de 40 logins CERTOS, o balde desse IP tem de estar a zero.
   */
  const [balde] = await sql<{ count: number }[]>`
    select count from rate_limit_hits where key = ${"auth:198.51.100.9|/sign-in/email"}
  `;
  conferir("contagem do balde após 40 logins certos", Number(balde?.count ?? 0), 0);
  console.info("");

  if (falhas.length > 0) {
    console.error(`FALHAS (${falhas.length}):`);
    for (const f of falhas) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.info("Todas as asserções passaram.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(falhas.length > 0 ? 1 : 0));
