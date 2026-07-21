import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import { channelMembers, channels, entitlements, events, tickets } from "@/db/schema";
import { newId } from "@/lib/ids";

/*
 * ⚠️  A BASE É REESCRITA PARA A DE TESTES ANTES DE `@/db` SER CARREGADO.
 *
 * Este script SEMEIA e TRUNCA. O servidor de medição abre o `TEST_DATABASE_URL`
 * (ver `servidor-medicao-frente-ac.mjs`), por isso o script tem de abrir a mesma
 * — senão semeia num sítio e mede noutro, e o resultado é um zero que só quer
 * dizer "não havia lá nada". O `import` de `@/db` é DINÂMICO por isso: os
 * imports estáticos são içados para cima da atribuição, e a ligação far-se-ia
 * com o valor antigo. A guarda `guardaDeBase()` confirma o resultado.
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
let db: typeof import("@/db")["db"];

/*
 * ============================================================================
 *  A MEDIÇÃO DA ROTA FUNDIDA — o staff não recebe dinheiro, o dono recebe
 * ============================================================================
 *
 *   node scripts/servidor-medicao-frente-ac.mjs        ← noutro terminal, 3021
 *   pnpm dlx tsx scripts/medir-eventos-fundidos.ts
 *
 * A PERGUNTA CENTRAL: a `/admin/eventos`, depois de fundir a antiga `/admin/agenda`,
 * ainda protege o dinheiro? Servida a uma sessão de `staff`, traz algum valor,
 * receita, preço ou email de comprador no CORPO EM BRUTO da resposta?
 *
 * PORQUE É QUE ISTO SE MEDE E NÃO SE LÊ: no App Router, o que a página FOI
 * BUSCAR entra no payload RSC mesmo que o componente que o mostrava não seja
 * desenhado. A rota fundida serve DUAS queries escolhidas pelo papel; se a
 * bifurcação estivesse mal feita — a query de gestão a correr para o staff, e só
 * as colunas escondidas — a receita viajava nos bytes na mesma. Só se vê a olhar
 * para os bytes, nos dois formatos que o Next serve (HTML e payload `RSC: 1`).
 *
 * O CONTROLO POSITIVO É METADE DA MEDIÇÃO: um zero não prova nada sozinho. As
 * MESMAS sondas são disparadas contra a MESMA rota com sessão de `owner` (e de
 * `admin`), onde TÊM de acender — é a prova de que a fusão não estragou a lista
 * de gestão. Zero no staff E maior que zero no controlo é o par que conta.
 *
 * E MEDE-SE O CRUZAMENTO ENTRE CANAIS: o staff da liga A não vê os eventos da
 * liga B na sua lista, nem lhes acede — o detalhe de um evento de B é
 * indistinguível de um id inventado (a recusa mede-se no corpo, não no status:
 * numa rota `force-dynamic` o `notFound()` responde 200 com o ecrã de "não
 * encontrado" no corpo, o mesmo que um id que não existe devolve).
 */

const BASE = "http://localhost:3021";
const PASSWORD = "Batalha-Rap-2026-segura";

/* Marcadores improváveis de aparecer por acidente. */
const MARCA = "ZZAC";
const CANAL_A = `${MARCA}-LIGA-A`;
const CANAL_B = `${MARCA}-LIGA-B`;
const EVENTO_A = `${MARCA}-BATALHA-A-BILHETES`;
const EVENTO_A_PPV = `${MARCA}-BATALHA-A-SO-PPV`;
const EVENTO_B = `${MARCA}-BATALHA-B-DA-OUTRA-LIGA`;
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

/** As sondas de dinheiro. Nenhuma pode acender no staff; todas no controlo. */
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

  // ── Cenário: DUAS ligas, para medir o cruzamento entre canais ─────────────
  const canalA = newId();
  const canalB = newId();
  await db.insert(channels).values([
    {
      id: canalA,
      slug: `zzac-a-${Date.now()}`,
      name: CANAL_A,
      tagline: "liga de medição A",
      accentColor: "#3355ff",
      initials: "ZA",
    },
    {
      id: canalB,
      slug: `zzac-b-${Date.now()}`,
      name: CANAL_B,
      tagline: "liga de medição B",
      accentColor: "#ff5533",
      initials: "ZB",
    },
  ]);

  const comBilhetes = newId();
  const soPpv = newId();
  const daOutraLiga = newId();
  await db.insert(events).values([
    {
      id: comBilhetes,
      channelId: canalA,
      title: EVENTO_A,
      startsAt: new Date(Date.now() + 86_400_000),
      priceCents: PPV_CENTS,
      ticketPriceCents: BILHETE_CENTS,
      ticketCapacity: LOTACAO,
      status: "draft",
    },
    {
      id: soPpv,
      channelId: canalA,
      title: EVENTO_A_PPV,
      startsAt: new Date(Date.now() + 172_800_000),
      priceCents: PPV_CENTS,
      status: "draft",
    },
    {
      // Da liga B: o staff da A nunca o deve ver nem abrir.
      id: daOutraLiga,
      channelId: canalB,
      title: EVENTO_B,
      startsAt: new Date(Date.now() + 259_200_000),
      priceCents: PPV_CENTS,
      ticketPriceCents: BILHETE_CENTS,
      ticketCapacity: LOTACAO,
      status: "draft",
    },
  ]);

  // Dois compradores PPV na liga A (→ receita 187,54 €) e um bilhete emitido.
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

  // ── As três sessões: staff e owner da liga A, e um platform_admin ─────────
  const equipa = await conta(`staff-${Date.now()}@exemplo.test`, "Equipa da Liga A");
  const dono = await conta(`dono-${Date.now()}@exemplo.test`, "Dono da Liga A");
  const firstrow = await conta(`admin-${Date.now()}@exemplo.test`, "FirstRow Plataforma");

  const idDe = async (nomeConta: string) => {
    const [linha] = await db.select({ id: user.id }).from(user).where(eq(user.name, nomeConta));
    return linha.id;
  };
  const idStaff = await idDe("Equipa da Liga A");
  const idDono = await idDe("Dono da Liga A");
  const idAdmin = await idDe("FirstRow Plataforma");

  await db.insert(channelMembers).values([
    { id: newId(), channelId: canalA, userId: idStaff, role: "staff" },
    { id: newId(), channelId: canalA, userId: idDono, role: "owner" },
  ]);
  // O admin não é membro de canal nenhum — o papel global chega. É de propósito:
  // prova que a lista de gestão da rota fundida também acende para a FirstRow.
  await db.update(user).set({ role: "platform_admin" }).where(eq(user.id, idAdmin));

  // ── A medição das sondas de dinheiro ──────────────────────────────────────
  type Caso = {
    rotulo: string;
    caminho: string;
    cookie: string;
    rsc: boolean;
    /** `true` = é onde as sondas TÊM de acender. */
    controlo: boolean;
  };
  /*
   * Cada sonda tem um ecrã onde é suposto acender (o controlo):
   *   · preço PPV e receita        → /admin/eventos com sessão de dono/admin
   *   · preço e lotação do bilhete → /admin/eventos/<id>/editar (o formulário)
   *   · nome e email do comprador  → /admin/subscritores
   * O veredito exige que TODAS acendam em pelo menos um controlo.
   */
  const casos: Caso[] = [
    // O que se está a provar: a rota fundida, ao staff, não traz dinheiro.
    {
      rotulo: "staff · /admin/eventos · HTML",
      caminho: "/admin/eventos",
      cookie: equipa,
      rsc: false,
      controlo: false,
    },
    {
      rotulo: "staff · /admin/eventos · RSC",
      caminho: "/admin/eventos",
      cookie: equipa,
      rsc: true,
      controlo: false,
    },
    // Controlo positivo na MESMA rota: ao dono, o dinheiro acende.
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
    // E à FirstRow também — a lista de gestão da rota fundida serve o admin.
    {
      rotulo: "admin · /admin/eventos · HTML (CONTROLO)",
      caminho: "/admin/eventos",
      cookie: firstrow,
      rsc: false,
      controlo: true,
    },
    // Onde o preço e a lotação do bilhete têm de aparecer: o formulário.
    {
      rotulo: "dono · /admin/eventos/<id>/editar · HTML (CONTROLO)",
      caminho: `/admin/eventos/${comBilhetes}/editar`,
      cookie: dono,
      rsc: false,
      controlo: true,
    },
    // Onde o nome e o email do comprador têm de aparecer: os subscritores.
    {
      rotulo: "dono · /admin/subscritores · HTML (CONTROLO)",
      caminho: "/admin/subscritores",
      cookie: dono,
      rsc: false,
      controlo: true,
    },
  ];

  const totais: Record<string, number> = {};
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
   * ── A lista do staff serve para alguma coisa? ─────────────────────────────
   * Uma página em branco passa qualquer sonda de dinheiro. A lista tem de trazer
   * os títulos dos eventos da liga A e os três destinos de operação.
   */
  const listaStaff = await pedir("/admin/eventos", equipa);
  const presencas: [string, string][] = [
    ["título do evento com bilhetes", EVENTO_A],
    ["título do evento só PPV", EVENTO_A_PPV],
    ["link da transmissão", `/admin/eventos/${comBilhetes}/transmissao`],
    ["link dos bilhetes", `/admin/eventos/${comBilhetes}/bilhetes`],
    ["link do scanner", `/admin/scanner?evento=${comBilhetes}`],
  ];
  console.info("── A LISTA DO STAFF TEM O QUE PROMETE ─────────────────────────\n");
  let uteis = 0;
  for (const [etiqueta, agulha] of presencas) {
    const n = contar(listaStaff.corpo, agulha);
    uteis += n > 0 ? 1 : 0;
    console.info(`    ${etiqueta}: ${n}`);
  }
  // O evento SEM bilhetes não pode ter link de scanner: seria mandar a equipa
  // para uma porta que não existe.
  const scannerAMais = contar(listaStaff.corpo, `/admin/scanner?evento=${soPpv}`);
  console.info(`    link de scanner no evento SEM bilhetes (tem de ser 0): ${scannerAMais}\n`);

  /*
   * ── O cruzamento entre canais ─────────────────────────────────────────────
   * O staff da liga A não vê o evento da liga B na lista, nem o consegue abrir.
   *
   * A recusa mede-se pelo CONTEÚDO, e não pelo status HTTP — e a razão é do
   * framework: no App Router uma página `force-dynamic` que chama `notFound()`
   * já COMEÇOU a responder (o corpo está a fazer stream), por isso o status fica
   * em 200 e o ecrã de "não encontrado" vai no corpo. É exatamente o mesmo 200
   * que um id INVENTADO devolve — e é isso que prova a recusa: o evento da outra
   * liga é INDISTINGUÍVEL de um id que não existe. Nenhum dos dois traz o título
   * do evento, e os corpos são gémeos. É a regra "recurso que não é teu responde
   * como se não existisse" (docs/SEGURANCA-APP.md), medida no corpo.
   */
  console.info("── CRUZAMENTO ENTRE CANAIS (staff da A vs liga B) ─────────────\n");
  const eventoBnaLista = contar(listaStaff.corpo, EVENTO_B);
  const detalheB = await pedir(`/admin/eventos/${daOutraLiga}/transmissao`, equipa);
  const editarB = await pedir(`/admin/eventos/${daOutraLiga}/editar`, equipa);
  const inventado = await pedir("/admin/eventos/evt_inventado_zzac/transmissao", equipa);
  // O positivo: o staff ABRE um evento da SUA liga, com conteúdo (as abas do
  // detalhe funcionam para quem tem papel no canal do evento).
  const detalheA = await pedir(`/admin/eventos/${comBilhetes}/transmissao`, equipa);

  const tituloBnoDetalhe = contar(detalheB.corpo, EVENTO_B);
  const tituloBnoEditar = contar(editarB.corpo, EVENTO_B);
  const tituloAnoSeu = contar(detalheA.corpo, EVENTO_A);
  // Gémeo do id inventado: o mesmo ecrã de não-encontrado (folga para qualquer
  // diferença de bytes irrelevante).
  const bComoInventado = Math.abs(detalheB.corpo.length - inventado.corpo.length) < 500;

  console.info(`    evento da liga B na LISTA do staff (tem de ser 0):    ${eventoBnaLista}`);
  console.info(`    título de B no DETALHE de B aberto pelo staff (0):    ${tituloBnoDetalhe}`);
  console.info(`    título de B no /editar de B aberto pelo staff (0):    ${tituloBnoEditar}`);
  console.info(
    `    detalhe de B é gémeo do id inventado (recusa igual): ${bComoInventado} (${detalheB.corpo.length} vs ${inventado.corpo.length} bytes)`,
  );
  console.info(`    título de A no detalhe de A, aberto pelo staff (>0):  ${tituloAnoSeu}`);
  console.info(
    `    (status HTTP do notFound numa rota dinâmica é 200: B=${detalheB.status}, inventado=${inventado.status})\n`,
  );

  // ── As portas de dinheiro continuam fechadas ao staff ─────────────────────
  console.info("── AS PORTAS DE DINHEIRO, COM SESSÃO DE STAFF ─────────────────\n");
  const fechadas = [
    "/admin/ganhos",
    "/admin/subscritores",
    "/admin/pagamentos",
    "/admin/eventos/novo",
  ];
  let recusas = 0;
  for (const caminho of fechadas) {
    const r = await pedir(caminho, equipa);
    if (r.status === 307 || r.status === 302) recusas += 1;
    console.info(`    ${caminho}: HTTP ${r.status} → ${r.local ?? "(sem redirect)"}`);
  }
  // A raiz manda-o para a lista de eventos, que é a casa nova de quem só opera.
  const raiz = await pedir("/admin", equipa);
  console.info(`    /admin: HTTP ${raiz.status} → ${raiz.local ?? "(sem redirect)"}\n`);

  // ── Veredito ──────────────────────────────────────────────────────────────
  const noStaff = totais["staff · /admin/eventos · HTML"] + totais["staff · /admin/eventos · RSC"];
  const noControlo = casos
    .filter((c) => c.controlo)
    .reduce((n, c) => n + (totais[c.rotulo] ?? 0), 0);

  const cruzamentoSeguro =
    eventoBnaLista === 0 && tituloBnoDetalhe === 0 && tituloBnoEditar === 0 && bComoInventado;

  console.info("── VEREDITO ───────────────────────────────────────────────────\n");
  console.info(`  Dinheiro no STAFF (/admin/eventos, HTML+RSC):  ${noStaff}   (tem de ser 0)`);
  console.info(`  Dinheiro no CONTROLO (dono+admin+editar+subs): ${noControlo}   (tem de ser > 0)`);
  console.info(
    `  Sondas MUDAS no controlo:                      ${sondasMudas.length}   (tem de ser 0)`,
  );
  console.info(`  Destinos úteis na lista do staff:              ${uteis}/5  (tem de ser 5)`);
  console.info(`  Scanner oferecido sem bilhetes:                ${scannerAMais}   (tem de ser 0)`);
  console.info(
    `  Liga B invisível ao staff (lista+detalhe):     ${cruzamentoSeguro ? "sim" : "NÃO"}`,
  );
  console.info(
    `  staff abre o SEU evento com conteúdo:          ${tituloAnoSeu > 0 ? "sim" : "não"}`,
  );
  console.info(`  Portas de dinheiro recusadas ao staff:         ${recusas}/4  (tem de ser 4)`);
  console.info(`  /admin do staff aponta a:                      ${raiz.local ?? "(nada)"}`);

  const passou =
    noStaff === 0 &&
    noControlo > 0 &&
    sondasMudas.length === 0 &&
    uteis === 5 &&
    scannerAMais === 0 &&
    cruzamentoSeguro &&
    tituloAnoSeu > 0 &&
    recusas === 4 &&
    (raiz.local ?? "").includes("/admin/eventos");
  console.info(`\n  ${passou ? "✓ ROTA FUNDIDA SEM DINHEIRO PARA O STAFF, E ÚTIL" : "✗ FALHOU"}\n`);

  await db.$client.end();
  process.exit(passou ? 0 : 1);
}

main().catch(async (erro) => {
  console.error(erro);
  await db.$client.end().catch(() => {});
  process.exit(1);
});
