import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import { channelMembers, channels, entitlements, events, tickets } from "@/db/schema";
import { newId } from "@/lib/ids";

/*
 * ⚠️  A BASE É REESCRITA PARA A DE TESTES ANTES DE `@/db` SER CARREGADO.
 *
 * Este script SEMEIA e TRUNCA. O servidor de medição abre o `TEST_DATABASE_URL`
 * (ver `servidor-medicao-frente-y.mjs`), por isso o script tem de abrir a mesma
 * — senão semeia num sítio e mede noutro, e o resultado é um zero que só quer
 * dizer "não havia lá nada". Herdar o `DATABASE_URL` do `.env` apontava-o à
 * base de DESENVOLVIMENTO, e truncá-la era perder o que lá estivesse.
 *
 * O `import` de `@/db` é DINÂMICO por isso mesmo: os imports estáticos são
 * içados para cima de qualquer atribuição, e a ligação far-se-ia com o valor
 * antigo. A guarda `guardaDeBase()` confirma o resultado, em vez de confiar.
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
/** Preenchido na primeira linha do `main()`, antes de qualquer query. */
let db: typeof import("@/db")["db"];

/*
 * ============================================================================
 *  A MEDIÇÃO DA AGENDA DO STAFF — zero dinheiro, com controlo positivo
 * ============================================================================
 *
 *   node scripts/servidor-medicao-frente-y.mjs      ← noutro terminal, 3017
 *   pnpm dlx tsx scripts/medir-agenda-do-staff.ts
 *
 * A PERGUNTA: a `/admin/agenda`, servida a uma sessão de `staff`, traz algum
 * valor, receita, preço ou email de comprador no CORPO EM BRUTO da resposta?
 *
 * PORQUE É QUE ISTO SE MEDE E NÃO SE LÊ: no App Router, o que a página foi
 * buscar entra no payload RSC mesmo que o componente que o mostrava não seja
 * desenhado. Uma coluna escondida no JSX continua a viajar nos bytes. Só se vê
 * a olhar para os bytes — e é isso que este script faz, nos dois formatos que o
 * Next serve da mesma rota (HTML de navegação directa e payload `RSC: 1`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O CONTROLO POSITIVO É METADE DA MEDIÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Um zero não prova nada sozinho: os marcadores podiam estar mal escritos, os
 * dados podiam não existir, a página podia estar vazia. Por isso as MESMAS
 * sondas são disparadas contra `/admin/eventos` com sessão de `owner` — a
 * página de gestão, que mostra PPV, compradores e receita por linha. Lá TÊM de
 * acender. Zero na agenda E maior que zero no controlo é o par que faz do zero
 * uma prova.
 *
 * E há um terceiro lado, para o zero não vir de a página estar em branco: a
 * agenda tem de conter o título do evento e os links de operação. Uma página
 * vazia passava a sonda do dinheiro e não servia para nada.
 */

const BASE = "http://localhost:3017";
const PASSWORD = "Batalha-Rap-2026-segura";

/* Marcadores improváveis de aparecer por acidente. */
const MARCA = "ZZQY";
const CANAL = `${MARCA}-LIGA`;
const EVENTO = `${MARCA}-BATALHA-COM-BILHETES`;
const EVENTO_SEM_BILHETES = `${MARCA}-BATALHA-SO-PPV`;
const COMPRADOR_NOME = `${MARCA}-COMPRADOR`;
const COMPRADOR_EMAIL = `${MARCA.toLowerCase()}-comprador@exemplo.test`;

/** 93,77 € de PPV e 45,55 € de bilhete — valores que nenhuma fábrica usa. */
const PPV_CENTS = 9377;
const BILHETE_CENTS = 4555;
const LOTACAO = 317;
/** 2 compradores × 93,77 € = 187,54 € de receita PPV. */
const RECEITA = "187,54";

const TABELAS = [
  "channel_members",
  "entitlements",
  "tickets",
  "playback_sessions",
  "purchase_consents",
  "chat_messages",
  "chat_timeouts",
  "event_likes",
  "events",
  "channels",
  "session",
  "account",
  "verification",
  "user",
];

async function guardaDeBase() {
  const [linha] = await db.execute<{ nome: string }>(sql`select current_database() as nome`);
  const nome = linha?.nome ?? "";
  if (!/test/i.test(nome) || ["neondb", "firstrow", "postgres"].includes(nome.toLowerCase())) {
    throw new Error(`RECUSADO: "${nome}" não é uma base descartável.`);
  }
  return nome;
}

/** Regista uma conta pelo servidor a sério e devolve o cookie de sessão. */
async function conta(email: string, nome: string): Promise<string> {
  for (const caminho of ["sign-up/email", "sign-in/email"]) {
    const corpo =
      caminho === "sign-up/email"
        ? JSON.stringify({ name: nome, email, password: PASSWORD })
        : JSON.stringify({ email, password: PASSWORD });
    const resposta = await fetch(`${BASE}/api/auth/${caminho}`, {
      method: "POST",
      // O `origin` é obrigatório: o Better Auth recusa pedidos sem ele (defesa
      // CSRF). Um browser mete-o sozinho; um `fetch` de script tem de o dizer.
      headers: { "content-type": "application/json", origin: BASE },
      body: corpo,
    });
    if (!resposta.ok) {
      throw new Error(`${caminho} falhou (${resposta.status}): ${await resposta.text()}`);
    }
    if (caminho === "sign-in/email") {
      const sessao = resposta.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      if (!sessao) throw new Error("sem cookie de sessão");
      return sessao;
    }
  }
  throw new Error("inalcançável");
}

type Resposta = { status: number; local: string | null; corpo: string };

async function pedir(caminho: string, cookie: string, rsc = false): Promise<Resposta> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    headers: { cookie, ...(rsc ? { RSC: "1" } : {}) },
    redirect: "manual",
  });
  return {
    status: resposta.status,
    local: resposta.headers.get("location"),
    corpo: await resposta.text(),
  };
}

function contar(corpo: string, agulha: string): number {
  return corpo.split(agulha).length - 1;
}

/** As sondas de dinheiro. Nenhuma pode acender na agenda; todas no controlo. */
const SONDAS: [string, string][] = [
  ["preço PPV formatado (93,77)", "93,77"],
  ["preço PPV em cêntimos (9377)", String(PPV_CENTS)],
  ["receita do evento (187,54)", RECEITA],
  ["preço do bilhete formatado (45,55)", "45,55"],
  ["preço do bilhete em cêntimos (4555)", String(BILHETE_CENTS)],
  ["lotação (317)", String(LOTACAO)],
  ["nome do comprador", COMPRADOR_NOME],
  ["email do comprador", COMPRADOR_EMAIL],
];

async function main() {
  ({ db } = await import("@/db"));
  const nome = await guardaDeBase();
  console.info(`Base: ${nome}\nServidor: ${BASE}\n`);
  await db.execute(sql.raw(`truncate table ${TABELAS.map((t) => `"${t}"`).join(", ")} cascade`));

  // ── Cenário: uma liga, dois eventos, duas compras e um bilhete ────────────
  const canal = newId();
  await db.insert(channels).values({
    id: canal,
    slug: `zzqy-${Date.now()}`,
    name: CANAL,
    tagline: "liga de medição",
    accentColor: "#3355ff",
    initials: "ZY",
  });

  const comBilhetes = newId();
  const soPpv = newId();
  await db.insert(events).values([
    {
      id: comBilhetes,
      channelId: canal,
      title: EVENTO,
      startsAt: new Date(Date.now() + 86_400_000),
      priceCents: PPV_CENTS,
      ticketPriceCents: BILHETE_CENTS,
      ticketCapacity: LOTACAO,
      status: "draft",
    },
    {
      id: soPpv,
      channelId: canal,
      title: EVENTO_SEM_BILHETES,
      startsAt: new Date(Date.now() + 172_800_000),
      priceCents: PPV_CENTS,
      status: "draft",
    },
  ]);

  // Dois compradores PPV (→ receita 187,54 €) e um bilhete emitido.
  for (let i = 0; i < 2; i += 1) {
    const id = newId();
    await db.insert(user).values({
      id,
      name: COMPRADOR_NOME,
      email: i === 0 ? COMPRADOR_EMAIL : `outro-${COMPRADOR_EMAIL}`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db
      .insert(entitlements)
      .values({ id: newId(), userId: id, eventId: comBilhetes, status: "active" });
    if (i === 0) {
      await db.insert(tickets).values({
        id: `tkt_${newId()}`,
        userId: id,
        eventId: comBilhetes,
        status: "issued",
        priceCents: BILHETE_CENTS,
      });
    }
  }

  // ── As duas sessões ───────────────────────────────────────────────────────
  const equipa = await conta(`staff-${Date.now()}@exemplo.test`, "Equipa da Liga");
  const dono = await conta(`dono-${Date.now()}@exemplo.test`, "Dono da Liga");

  const [linhaStaff] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.name, "Equipa da Liga"));
  const [linhaDono] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.name, "Dono da Liga"));

  await db.insert(channelMembers).values([
    { id: newId(), channelId: canal, userId: linhaStaff.id, role: "staff" },
    { id: newId(), channelId: canal, userId: linhaDono.id, role: "owner" },
  ]);

  // ── A medição ─────────────────────────────────────────────────────────────
  type Caso = {
    rotulo: string;
    caminho: string;
    cookie: string;
    rsc: boolean;
    /** `true` = é onde as sondas TÊM de acender. */
    controlo: boolean;
  };
  /*
   * ⚠️  SÃO PRECISOS TRÊS ECRÃS DE CONTROLO, E NÃO UM.
   *
   * A primeira versão deste script usava só `/admin/eventos`. As sondas do
   * preço do BILHETE, da LOTAÇÃO e do COMPRADOR davam zero lá também — porque
   * essa página nunca os mostra. Ou seja: para cinco das oito sondas, o zero na
   * agenda não provava nada, só provava que o marcador não estava a ser
   * procurado onde vivia.
   *
   * Cada sonda tem agora um ecrã onde é suposto acender:
   *   · preço PPV e receita     → /admin/eventos    (a lista de gestão)
   *   · preço e lotação do bilhete → /admin/eventos/<id>/editar (o formulário)
   *   · nome e email do comprador  → /admin/subscritores
   *
   * O veredito exige que TODAS acendam em pelo menos um controlo.
   */
  const casos: Caso[] = [
    {
      rotulo: "staff · /admin/agenda · HTML",
      caminho: "/admin/agenda",
      cookie: equipa,
      rsc: false,
      controlo: false,
    },
    {
      rotulo: "staff · /admin/agenda · RSC",
      caminho: "/admin/agenda",
      cookie: equipa,
      rsc: true,
      controlo: false,
    },
    {
      rotulo: "dono · /admin/agenda · HTML",
      caminho: "/admin/agenda",
      cookie: dono,
      rsc: false,
      controlo: false,
    },
    {
      rotulo: "dono · /admin/eventos · HTML (CONTROLO)",
      caminho: "/admin/eventos",
      cookie: dono,
      rsc: false,
      controlo: true,
    },
    {
      rotulo: "dono · /admin/eventos · RSC (CONTROLO)",
      caminho: "/admin/eventos",
      cookie: dono,
      rsc: true,
      controlo: true,
    },
    {
      rotulo: "dono · /admin/eventos/<id>/editar · HTML (CONTROLO)",
      caminho: `/admin/eventos/${comBilhetes}/editar`,
      cookie: dono,
      rsc: false,
      controlo: true,
    },
    {
      rotulo: "dono · /admin/subscritores · HTML (CONTROLO)",
      caminho: "/admin/subscritores",
      cookie: dono,
      rsc: false,
      controlo: true,
    },
  ];

  const totais: Record<string, number> = {};
  /** Quantas vezes cada sonda acendeu SOMADAS todas as páginas de controlo. */
  const acendeuNoControlo = new Map(SONDAS.map(([etiqueta]) => [etiqueta, 0]));
  console.info("── SONDAS DE DINHEIRO ─────────────────────────────────────────\n");

  for (const caso of casos) {
    const { status, corpo } = await pedir(caso.caminho, caso.cookie, caso.rsc);
    let total = 0;
    const detalhe: string[] = [];
    for (const [etiqueta, agulha] of SONDAS) {
      const n = contar(corpo, agulha);
      total += n;
      if (caso.controlo)
        acendeuNoControlo.set(etiqueta, (acendeuNoControlo.get(etiqueta) ?? 0) + n);
      detalhe.push(`${etiqueta}: ${n}`);
    }
    totais[caso.rotulo] = total;
    console.info(caso.rotulo);
    console.info(`  HTTP ${status} · ${corpo.length} bytes`);
    for (const linha of detalhe) console.info(`    ${linha}`);
    console.info(`  TOTAL: ${total}\n`);
  }

  console.info("── COBERTURA DO CONTROLO (cada sonda tem de acender) ──────────\n");
  const sondasMudas = [...acendeuNoControlo.entries()].filter(([, n]) => n === 0);
  for (const [etiqueta, n] of acendeuNoControlo) {
    console.info(`    ${etiqueta}: ${n} ${n === 0 ? "← MUDA, não prova nada" : ""}`);
  }
  console.info("");

  /*
   * ── A agenda serve para alguma coisa? ─────────────────────────────────────
   *
   * O contra-teste do zero. Uma página em branco passa qualquer sonda de
   * dinheiro — e não é isso que se quer provar. A agenda tem de trazer o título
   * dos eventos e os três destinos de operação.
   */
  const agenda = await pedir("/admin/agenda", equipa);
  const presencas: [string, string][] = [
    ["título do evento com bilhetes", EVENTO],
    ["título do evento só PPV", EVENTO_SEM_BILHETES],
    ["link da transmissão", `/admin/eventos/${comBilhetes}/transmissao`],
    ["link dos bilhetes", `/admin/eventos/${comBilhetes}/bilhetes`],
    ["link do scanner", `/admin/scanner?evento=${comBilhetes}`],
  ];
  console.info("── A AGENDA TEM O QUE PROMETE (staff) ─────────────────────────\n");
  let uteis = 0;
  for (const [etiqueta, agulha] of presencas) {
    const n = contar(agenda.corpo, agulha);
    uteis += n > 0 ? 1 : 0;
    console.info(`    ${etiqueta}: ${n}`);
  }
  /*
   * O evento SEM bilhetes não pode ter link de scanner nem de bilhetes: seria
   * mandar a equipa para uma porta que não existe.
   */
  const scannerAMais = contar(agenda.corpo, `/admin/scanner?evento=${soPpv}`);
  console.info(`    link de scanner no evento SEM bilhetes (tem de ser 0): ${scannerAMais}\n`);

  // ── As portas continuam fechadas ao staff ─────────────────────────────────
  console.info("── AS PORTAS DE DINHEIRO, COM SESSÃO DE STAFF ─────────────────\n");
  const fechadas = ["/admin/eventos", "/admin/ganhos", "/admin/subscritores", "/admin/pagamentos"];
  let recusas = 0;
  for (const caminho of fechadas) {
    const r = await pedir(caminho, equipa);
    const recusado = r.status === 307 || r.status === 302;
    if (recusado) recusas += 1;
    console.info(`    ${caminho}: HTTP ${r.status} → ${r.local ?? "(sem redirect)"}`);
  }
  // A raiz manda-o para a agenda, que é a casa nova de quem só opera.
  const raiz = await pedir("/admin", equipa);
  console.info(`    /admin: HTTP ${raiz.status} → ${raiz.local ?? "(sem redirect)"}\n`);

  // ── Veredito ──────────────────────────────────────────────────────────────
  const naAgenda =
    totais["staff · /admin/agenda · HTML"] +
    totais["staff · /admin/agenda · RSC"] +
    totais["dono · /admin/agenda · HTML"];
  const noControlo = casos
    .filter((c) => c.controlo)
    .reduce((n, c) => n + (totais[c.rotulo] ?? 0), 0);

  console.info("── VEREDITO ───────────────────────────────────────────────────\n");
  console.info(`  Marcadores de dinheiro na AGENDA:        ${naAgenda}   (tem de ser 0)`);
  console.info(`  Marcadores de dinheiro no CONTROLO:      ${noControlo}   (tem de ser > 0)`);
  console.info(
    `  Sondas MUDAS no controlo:                ${sondasMudas.length}   (tem de ser 0 — uma sonda que nunca acende não prova nada)`,
  );
  console.info(`  Destinos úteis presentes na agenda:      ${uteis}/5  (tem de ser 5)`);
  console.info(`  Scanner oferecido sem bilhetes:          ${scannerAMais}   (tem de ser 0)`);
  console.info(`  Portas de dinheiro recusadas ao staff:   ${recusas}/4  (tem de ser 4)`);
  console.info(`  /admin do staff aponta a:                ${raiz.local ?? "(nada)"}`);

  const passou =
    naAgenda === 0 &&
    noControlo > 0 &&
    sondasMudas.length === 0 &&
    uteis === 5 &&
    scannerAMais === 0 &&
    recusas === 4 &&
    (raiz.local ?? "").includes("/admin/agenda");
  console.info(`\n  ${passou ? "✓ AGENDA SEM DINHEIRO, E ÚTIL" : "✗ FALHOU"}\n`);

  await db.$client.end();
  process.exit(passou ? 0 : 1);
}

main().catch(async (erro) => {
  console.error(erro);
  await db.$client.end().catch(() => {});
  process.exit(1);
});
