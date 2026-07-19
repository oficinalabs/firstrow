import "server-only";
import { and, desc, eq, gt, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, events, tickets } from "@/db/schema";
import { confirmPaid } from "@/lib/eupago";
import { type ChannelScope, inScope } from "@/server/authz";
import { grantAndNotify, type PurchaseKind } from "@/server/fulfilment";

/*
 * ============================================================================
 *  RECONCILIAÇÃO — perguntar à Eupago o que o webhook não nos disse
 * ============================================================================
 *
 * O PROBLEMA, QUE JÁ ACONTECEU
 * Em sandbox, um pagamento foi confirmado do lado da Eupago, ela avisou o
 * administrador **por email**, e o webhook nunca chegou. A compra ficou
 * `pending` para sempre e só foi ativada porque alguém enviou o webhook à mão.
 * Em produção isso é um cliente que pagou, não tem acesso, e ninguém dá por
 * isso: nem ele, nem a liga, nem nós.
 *
 * A notificação nunca foi prova de nada — quem sabe é a Eupago, e ela responde
 * a quem lhe perguntar (`confirmPaid`). Faltava alguém perguntar sozinho.
 *
 * QUANDO É QUE ISTO CORRE — as duas metades, e porquê as duas
 *
 *  · **Quem está à espera** (`app/api/entitlements`, `app/api/tickets/status`).
 *    É o caminho que importa ao cliente: ele está no ecrã de compra, a fazer
 *    polling, e é ele quem sabe que pagou. Fecha a compra em segundos, sem
 *    esperar por cron nenhum. É também o mais barato: só corre quando há mesmo
 *    alguém à espera, e nunca quando o webhook já fez o trabalho.
 *  · **O cron** (`app/api/cron/reconciliar`). É a rede por baixo: quem fechou
 *    o separador, quem pagou com o telemóvel e não voltou ao browser, e a noite
 *    em que a Eupago só nos responde meia hora depois. Sem ele, uma compra
 *    perdida só se descobria por reclamação.
 *
 * Nenhuma das duas chega sozinha. Só o cron deixava o cliente à espera do
 * próximo ciclo com o dinheiro já debitado; só o polling perdia toda a gente
 * que sai da página — que é exatamente o caso que motivou isto.
 *
 * O QUE ISTO **NÃO** FAZ, E É DE PROPÓSITO
 * Não ativa nada por conta própria. Passa pelo mesmo `confirmPaid` e pelo mesmo
 * `grantAndNotify` do webhook (`server/fulfilment.ts`). Um segundo caminho que
 * se desviasse do original divergia ao terceiro mês sem ninguém dar por isso.
 */

/**
 * As janelas e os tetos, num sítio só.
 *
 * `graceMs` — folga dada ao webhook antes de irmos nós perguntar. Sem ela,
 * perguntávamos à Eupago por cima de um webhook que vinha a caminho.
 *
 * `horizonMs` — idade a partir da qual deixamos de perguntar. Não é uma
 * escolha estética: o pedido MB WAY expira ao fim de ~5 minutos do lado da
 * Eupago (é a janela de `CHARGE_WINDOW_MS`, em `server/purchases.ts`), por isso
 * uma compra que não foi paga nesse tempo já não pode vir a ser. As duas horas
 * são margem grossa para atrasos do lado deles e para o cron estar em baixo um
 * bocado — e são o que impede o custo de crescer com o histórico: uma compra
 * abandonada sai da janela sozinha e nunca mais é perguntada.
 *
 * `cooldownMs` — intervalo mínimo entre duas perguntas sobre a MESMA compra.
 * É isto que torna o caminho de quem espera viável: o ecrã de compra faz
 * polling de poucos em poucos segundos e sem travão cada segundo era uma
 * chamada à Eupago.
 *
 * `lote` / `paralelas` — teto do varrimento e quantas perguntas ao mesmo tempo.
 * Em série, 40 perguntas de ~300 ms passavam do tempo de uma função serverless.
 */
export const RECONCILE = {
  graceMs: 30_000,
  horizonMs: 2 * 60 * 60 * 1000,
  cooldownMs: 30_000,
  lote: 40,
  paralelas: 5,
} as const;

/** O que um varrimento fez. Números, para poder ser medido e registado. */
export type ReconcileReport = {
  /** Compras elegíveis encontradas (já com o teto do lote aplicado). */
  candidatas: number;
  /** Quantas chegaram a ser perguntadas à Eupago (as outras estavam em espera). */
  perguntadas: number;
  /** Quantas passaram a ter acesso NESTE varrimento. */
  ativadas: number;
  /** Quantas a Eupago disse que ainda não estão pagas. */
  porPagar: number;
  /** Quantas já tinham sido fechadas por outro caminho entretanto. */
  semEfeito: number;
  /** Quantas rebentaram. Uma compra estragada não pode parar o varrimento. */
  erros: number;
};

const VAZIO: ReconcileReport = {
  candidatas: 0,
  perguntadas: 0,
  ativadas: 0,
  porPagar: 0,
  semEfeito: 0,
  erros: 0,
};

/** Uma compra pendente que vale a pena perguntar à Eupago. */
type Candidata = { kind: PurchaseKind; id: string; reference: string };

function tabela(kind: PurchaseKind) {
  return kind === "entitlement" ? entitlements : tickets;
}

/**
 * Os cortes de tempo desta passagem, calculados UMA vez.
 *
 * Calculá-los por linha deixava a janela a mexer a meio do varrimento — nada
 * de grave, mas torna impossível dizer ao certo o que é que foi perguntado.
 */
function cortes(agora = Date.now()) {
  return {
    /** Cobranças mais recentes do que isto ainda estão a dar tempo ao webhook. */
    grace: new Date(agora - RECONCILE.graceMs),
    /** Cobranças mais antigas do que isto já não podem vir a ser pagas. */
    horizonte: new Date(agora - RECONCILE.horizonMs),
    /** Compras perguntadas depois disto ficam de fora até arrefecerem. */
    arrefecimento: new Date(agora - RECONCILE.cooldownMs),
  };
}

/**
 * O que faz de uma compra candidata, escrito uma vez para as duas tabelas.
 *
 * `providerRef` não nulo é obrigatório e não é detalhe: sem referência não há
 * nada para perguntar à Eupago. É por isso que ela passou a ser guardada logo
 * na criação da cobrança e não só quando o webhook chega — ver a nota em
 * `server/purchases.ts:recordChargeReference`.
 */
function elegivel(kind: PurchaseKind, c: ReturnType<typeof cortes>) {
  const t = tabela(kind);
  return and(
    eq(t.status, "pending"),
    isNotNull(t.providerRef),
    lte(t.chargeRequestedAt, c.grace),
    gt(t.chargeRequestedAt, c.horizonte),
    or(isNull(t.reconciledAt), lt(t.reconciledAt, c.arrefecimento)),
  );
}

/**
 * As compras pendentes de um âmbito de canais que vale a pena perguntar.
 *
 * O `innerJoin` a `events` existe só para o âmbito — e é ele que impede o dono
 * do canal A de disparar (e de ver o resultado de) verificações do canal B a
 * partir do botão do backoffice. `inScope` devolve `false` para quem não gere
 * canal nenhum, ou seja ZERO linhas, nunca "sem filtro".
 */
async function candidatasNoAmbito(
  kind: PurchaseKind,
  scope: ChannelScope,
  c: ReturnType<typeof cortes>,
  limite: number,
): Promise<Candidata[]> {
  const t = tabela(kind);
  const rows = await db
    .select({ id: t.id, reference: t.providerRef })
    .from(t)
    .innerJoin(events, eq(t.eventId, events.id))
    .where(and(elegivel(kind, c), inScope(events.channelId, scope)))
    .orderBy(desc(t.chargeRequestedAt))
    .limit(limite);
  return rows.flatMap((r) => (r.reference ? [{ kind, id: r.id, reference: r.reference }] : []));
}

/**
 * Reclama a compra para esta verificação — e é aqui que a idempotência mora.
 *
 * O `where` com o carimbo não é a mesma coisa que um `select` seguido de
 * `update`: o Postgres bloqueia a linha, espera, e **reavalia a condição** com
 * o valor já escrito pelo primeiro. Duas verificações em paralelo sobre a mesma
 * compra dão exatamente uma linha devolvida — a outra vai-se embora sem
 * perguntar nada à Eupago.
 *
 * É a mesma lição do `pg_advisory_xact_lock` de `server/events.ts`, ao
 * contrário: ali um SELECT+INSERT não serializava nada porque não havia linha
 * onde bloquear; aqui há, e o UPDATE condicional chega.
 *
 * A referência vem DESTA leitura e não de fora: quem reclama é quem lê o valor
 * com que vai perguntar.
 */
async function reclamar(
  candidata: Candidata,
  c: ReturnType<typeof cortes>,
): Promise<string | null> {
  const t = tabela(candidata.kind);
  const [row] = await db
    .update(t)
    .set({ reconciledAt: new Date() })
    .where(
      and(
        eq(t.id, candidata.id),
        eq(t.status, "pending"),
        isNotNull(t.providerRef),
        or(isNull(t.reconciledAt), lt(t.reconciledAt, c.arrefecimento)),
      ),
    )
    .returning({ reference: t.providerRef });
  return row?.reference ?? null;
}

function soma(a: ReconcileReport, b: Partial<ReconcileReport>): ReconcileReport {
  return {
    candidatas: a.candidatas + (b.candidatas ?? 0),
    perguntadas: a.perguntadas + (b.perguntadas ?? 0),
    ativadas: a.ativadas + (b.ativadas ?? 0),
    porPagar: a.porPagar + (b.porPagar ?? 0),
    semEfeito: a.semEfeito + (b.semEfeito ?? 0),
    erros: a.erros + (b.erros ?? 0),
  };
}

/**
 * Uma compra: reclamar, perguntar, e fechar se estiver paga.
 *
 * Nunca lança. Uma compra estragada (referência que a Eupago não reconhece,
 * rede em baixo) não pode levar atrás o varrimento das outras — o objetivo
 * disto é precisamente não perder dinheiro por silêncio.
 */
async function verificar(
  candidata: Candidata,
  c: ReturnType<typeof cortes>,
): Promise<Partial<ReconcileReport>> {
  try {
    const reference = await reclamar(candidata, c);
    // Outra verificação ganhou a corrida (ou o webhook fechou-a entretanto).
    if (!reference) return {};

    if (!(await confirmPaid(reference))) return { perguntadas: 1, porPagar: 1 };

    const resultado = await grantAndNotify(candidata.id, reference);
    return resultado === "ativada"
      ? { perguntadas: 1, ativadas: 1 }
      : { perguntadas: 1, semEfeito: 1 };
  } catch (error) {
    // Sem o identificador da compra no log isto era impossível de investigar;
    // com ele, e sem mais nada, não vai daqui nenhum dado do comprador.
    console.error(`[reconciliação] ${candidata.kind} ${candidata.id} falhou:`, error);
    return { erros: 1 };
  }
}

/**
 * Corre as verificações em grupos, e não todas de uma vez.
 *
 * 40 perguntas em série de ~300 ms passavam do tempo de uma função serverless;
 * 40 ao mesmo tempo era um pico desnecessário em cima da Eupago.
 */
async function verificarTodas(
  candidatas: Candidata[],
  c: ReturnType<typeof cortes>,
): Promise<ReconcileReport> {
  let relatorio = soma(VAZIO, { candidatas: candidatas.length });
  for (let i = 0; i < candidatas.length; i += RECONCILE.paralelas) {
    const grupo = candidatas.slice(i, i + RECONCILE.paralelas);
    const parciais = await Promise.all(grupo.map((candidata) => verificar(candidata, c)));
    for (const parcial of parciais) relatorio = soma(relatorio, parcial);
  }
  return relatorio;
}

/**
 * Varre as compras pendentes de um âmbito de canais.
 *
 * É o que o cron corre (com `{ all: true }`) e o que o botão do backoffice
 * corre (com o âmbito de quem carregou nele).
 */
export async function reconcilePending(scope: ChannelScope): Promise<ReconcileReport> {
  const c = cortes();
  const [acessos, bilhetes] = await Promise.all([
    candidatasNoAmbito("entitlement", scope, c, RECONCILE.lote),
    candidatasNoAmbito("ticket", scope, c, RECONCILE.lote),
  ]);
  return verificarTodas([...acessos, ...bilhetes].slice(0, RECONCILE.lote), c);
}

/**
 * Verifica UMA compra, se ela estiver elegível. O caminho de quem está à espera.
 *
 * Não leva âmbito de canal de propósito: quem chama já provou a posse da compra
 * (a query do polling filtra pelo dono da sessão) e o comprador não é membro de
 * canal nenhum. O que a defende de ser usada às cegas é a própria condição de
 * elegibilidade — sem cobrança pedida e sem referência não há nada a fazer.
 */
export async function reconcilePurchase(kind: PurchaseKind, id: string): Promise<ReconcileReport> {
  const c = cortes();
  const t = tabela(kind);
  const rows = await db
    .select({ id: t.id, reference: t.providerRef })
    .from(t)
    .where(and(eq(t.id, id), elegivel(kind, c)))
    .limit(1);

  const candidata = rows[0];
  if (!candidata?.reference) return VAZIO;
  return verificarTodas([{ kind, id: candidata.id, reference: candidata.reference }], c);
}
