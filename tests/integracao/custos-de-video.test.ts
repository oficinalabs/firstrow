import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { entitlements, playbackSessions } from "@/db/schema";
import { newId } from "@/lib/ids";
import { DEFAULT_USD_TO_EUR, MAX_SESSION_MINUTES } from "@/lib/video-costs";
import { getDeliveryByEvent, getMonthlyStatement, getPlatformEconomics } from "@/server/stats";
import { limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import {
  criarCanal,
  criarEntitlement,
  criarEvento,
  criarSessao,
  criarUtilizador,
} from "../apoio/fabrica";

/*
 * ============================================================================
 *  CUSTO DE VÍDEO — contra a base de dados, com minutos semeados à mão
 * ============================================================================
 *
 * O ficheiro de unidade prova a aritmética. Este prova a OUTRA metade, que é
 * onde os erros se escondem: que a query lê os carimbos certos, trata os casos
 * sujos como está escrito que trata, e não soma um único minuto de um canal
 * que não é do âmbito.
 *
 * Todas as sessões aqui têm duração semeada e conhecida. Nenhuma depende do
 * relógio da corrida — se dependessem, mediam a latência do Neon.
 */

const MINUTO = 60_000;

/** Uma sessão que começou há `hM` minutos e cujo último heartbeat durou `dM`. */
function janela(duracaoMinutos: number, comecouHaMinutos = 600) {
  const startedAt = new Date(Date.now() - comecouHaMinutos * MINUTO);
  return { startedAt, lastHeartbeatAt: new Date(startedAt.getTime() + duracaoMinutos * MINUTO) };
}

describe.skipIf(!temBaseDeDados())("minutos entregues por evento", () => {
  beforeEach(limparBase);

  it("soma as durações das sessões, ao minuto", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const [a, b] = await Promise.all([criarUtilizador(), criarUtilizador()]);

    await Promise.all([
      criarSessao(a.id, evento.id, janela(90)),
      criarSessao(b.id, evento.id, janela(30)),
    ]);

    const delivery = await getDeliveryByEvent({ all: true });

    expect(delivery.get(evento.id)).toEqual({ sessions: 2, minutes: 120, cappedSessions: 0 });
  });

  /*
   * CASO 1 — sessão que nunca fechou. O portátil fechou-se, o heartbeat parou,
   * e o `lastHeartbeatAt` ficou onde estava. A duração NÃO continua a crescer:
   * é por isso que a fórmula não usa `now()`. Aqui a sessão começou há 10 horas
   * e só tem 45 minutos de visionamento — tem de dar 45, não 600.
   */
  it("uma sessão abandonada vale o que o heartbeat viu, não o tempo que passou", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoa = await criarUtilizador();

    await criarSessao(pessoa.id, evento.id, janela(45, 600));

    const delivery = await getDeliveryByEvent({ all: true });

    expect(delivery.get(evento.id)?.minutes).toBe(45);
  });

  /*
   * CASO 2 — sessão cortada pela regra de 1-sessão-por-conta. CONTA-SE: aqueles
   * minutos foram mesmo entregues e a Cloudflare cobrou-os. O corte limita o
   * fim, não apaga o que já passou.
   */
  it("uma sessão revogada conta os minutos que entregou antes do corte", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoa = await criarUtilizador();
    const { startedAt, lastHeartbeatAt } = janela(50);

    await criarSessao(pessoa.id, evento.id, {
      startedAt,
      lastHeartbeatAt,
      // Revogada um minuto depois do último heartbeat, que é como acontece na
      // vida real (`heartbeat()` não carimba depois de revogada).
      revokedAt: new Date(lastHeartbeatAt.getTime() + MINUTO),
    });

    const delivery = await getDeliveryByEvent({ all: true });

    expect(delivery.get(evento.id)).toEqual({ sessions: 1, minutes: 50, cappedSessions: 0 });
  });

  /*
   * A guarda do `least`: se alguém um dia mudar `heartbeat()` para carimbar
   * mesmo depois do corte, o fim efetivo continua a ser a revogação. Hoje isto
   * não acontece — e é exatamente por isso que vale a pena estar coberto.
   */
  it("com o heartbeat depois da revogação, manda a revogação", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoa = await criarUtilizador();
    const startedAt = new Date(Date.now() - 600 * MINUTO);

    await criarSessao(pessoa.id, evento.id, {
      startedAt,
      lastHeartbeatAt: new Date(startedAt.getTime() + 80 * MINUTO),
      revokedAt: new Date(startedAt.getTime() + 20 * MINUTO),
    });

    const delivery = await getDeliveryByEvent({ all: true });

    expect(delivery.get(evento.id)?.minutes).toBe(20);
  });

  /*
   * CASO 3 — duração negativa. Não é teórico: `startedAt` vem do relógio da BASE
   * DE DADOS e `lastHeartbeatAt` do relógio do SERVIDOR (server/playback.ts). Um
   * servidor atrasado dava uma sessão negativa, que SUBTRAÍA minutos ao evento.
   */
  it("uma duração negativa vale zero, e não desconta minutos ao evento", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const [a, b] = await Promise.all([criarUtilizador(), criarUtilizador()]);
    const startedAt = new Date(Date.now() - 60 * MINUTO);

    await Promise.all([
      criarSessao(a.id, evento.id, janela(30)),
      // Relógio trocado: o heartbeat aconteceu "antes" do início.
      criarSessao(b.id, evento.id, {
        startedAt,
        lastHeartbeatAt: new Date(startedAt.getTime() - 5 * MINUTO),
      }),
    ]);

    const delivery = await getDeliveryByEvent({ all: true });

    // 30 e não 25: a sessão impossível soma zero, não menos cinco.
    expect(delivery.get(evento.id)).toEqual({ sessions: 2, minutes: 30, cappedSessions: 0 });
  });

  /* CASO 4 — o teto por sessão, e a confissão de que ele disparou. */
  it("trunca uma sessão absurda no teto e conta-a como truncada", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const [a, b] = await Promise.all([criarUtilizador(), criarUtilizador()]);

    await Promise.all([
      criarSessao(a.id, evento.id, janela(MAX_SESSION_MINUTES + 5000, 20_000)),
      criarSessao(b.id, evento.id, janela(60)),
    ]);

    const delivery = await getDeliveryByEvent({ all: true });

    expect(delivery.get(evento.id)).toEqual({
      sessions: 2,
      minutes: MAX_SESSION_MINUTES + 60,
      cappedSessions: 1,
    });
  });

  /* Exatamente no teto ainda não é truncar — o limite é inclusivo. */
  it("uma sessão exatamente no teto não conta como truncada", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoa = await criarUtilizador();

    await criarSessao(pessoa.id, evento.id, janela(MAX_SESSION_MINUTES, 20_000));

    const delivery = await getDeliveryByEvent({ all: true });

    expect(delivery.get(evento.id)).toEqual({
      sessions: 1,
      minutes: MAX_SESSION_MINUTES,
      cappedSessions: 0,
    });
  });

  /*
   * CASO 5 — "ninguém viu" não é "não sabemos". Uma sessão de duração zero é um
   * dado: alguém abriu e fechou. Um evento SEM sessões nenhumas fica fora do
   * mapa, e é isso que faz o ecrã escrever "—" em vez de "0,00 €".
   */
  it("distingue um evento aberto-e-fechado de um evento sem dados", async () => {
    const canal = await criarCanal();
    const [visto, nuncaVisto] = await Promise.all([criarEvento(canal.id), criarEvento(canal.id)]);
    const pessoa = await criarUtilizador();

    await criarSessao(pessoa.id, visto.id, janela(0));

    const delivery = await getDeliveryByEvent({ all: true });

    expect(delivery.get(visto.id)).toEqual({ sessions: 1, minutes: 0, cappedSessions: 0 });
    expect(delivery.has(nuncaVisto.id)).toBe(false);
  });

  it("os segundos somam-se todos antes de virarem minutos", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id);
    const pessoas = await Promise.all(Array.from({ length: 4 }, () => criarUtilizador()));

    // 4 × 40 segundos = 160 s = 2,67 min → 3. Arredondar cada uma dava 4 × 1 = 4.
    const startedAt = new Date(Date.now() - 60 * MINUTO);
    await Promise.all(
      pessoas.map((p) =>
        criarSessao(p.id, evento.id, {
          startedAt,
          lastHeartbeatAt: new Date(startedAt.getTime() + 40_000),
        }),
      ),
    );

    expect((await getDeliveryByEvent({ all: true })).get(evento.id)?.minutes).toBe(3);
  });
});

/*
 * ============================================================================
 *  ISOLAMENTO — a fuga mais cara que este produto pode ter
 * ============================================================================
 *
 * Custos e espectadores são tão sensíveis como a receita: dizem quanta gente a
 * liga tem e quanto tempo fica. Um âmbito vazio traduzido para "sem filtro"
 * mostrava a audiência de todas as ligas a quem não gere nenhuma.
 */
describe.skipIf(!temBaseDeDados())("isolamento por canal nos custos", () => {
  beforeEach(limparBase);

  async function doisCanaisVistos() {
    const [canalA, canalB] = await Promise.all([criarCanal(), criarCanal()]);
    const [eventoA, eventoB] = await Promise.all([
      criarEvento(canalA.id, { priceCents: 850 }),
      criarEvento(canalB.id, { priceCents: 850 }),
    ]);
    const [pa, pb] = await Promise.all([criarUtilizador(), criarUtilizador()]);

    await Promise.all([
      criarEntitlement(pa.id, eventoA.id, { status: "active" }),
      criarEntitlement(pb.id, eventoB.id, { status: "active" }),
      criarSessao(pa.id, eventoA.id, janela(100)),
      criarSessao(pb.id, eventoB.id, janela(200)),
    ]);

    return { canalA, canalB, eventoA, eventoB };
  }

  it("cada canal só vê os minutos dos seus eventos", async () => {
    const { canalA, eventoA, eventoB } = await doisCanaisVistos();

    const soA = await getDeliveryByEvent({ all: false, channelIds: [canalA.id] });

    expect(soA.get(eventoA.id)?.minutes).toBe(100);
    // O evento do outro canal nem aparece no mapa — nem com zero minutos.
    expect(soA.has(eventoB.id)).toBe(false);
  });

  /*
   * O CORAÇÃO DO FICHEIRO. Âmbito vazio tem de dar ZERO linhas, nunca "sem
   * filtro". `inScope` devolve `false` explícito (server/authz.ts) e é essa
   * linha que aqui se prova pelo resultado, e não pela leitura.
   */
  it("um âmbito vazio não vê um único minuto nem um único cêntimo", async () => {
    await doisCanaisVistos();

    const semNada = { all: false, channelIds: [] } as const;
    const delivery = await getDeliveryByEvent(semNada);
    const economics = await getPlatformEconomics(semNada);

    expect(delivery.size).toBe(0);
    expect(economics.rows).toHaveLength(0);
    expect(economics.totals.revenueCents).toBe(0);
    expect(economics.totals.commissionCents).toBe(0);
    expect(economics.totals.videoCostEurCents).toBe(0);
    expect(economics.totals.minutes).toBe(0);
  });

  it("a economia por evento fica dentro do âmbito, receita e custo", async () => {
    const { canalA, eventoA, eventoB } = await doisCanaisVistos();

    const soA = await getPlatformEconomics({ all: false, channelIds: [canalA.id] });
    const tudo = await getPlatformEconomics({ all: true });

    expect(soA.rows.map((r) => r.eventId)).toEqual([eventoA.id]);
    expect(soA.rows[0].minutes).toBe(100);
    expect(soA.totals.revenueCents).toBe(850);

    // A plataforma vê os dois — é a prova de que o filtro acima cortou mesmo
    // alguma coisa, em vez de a base estar vazia.
    expect(tudo.rows.map((r) => r.eventId).sort()).toEqual([eventoA.id, eventoB.id].sort());
    expect(tudo.totals.minutes).toBe(300);
  });

  /*
   * Uma sessão de alguém de FORA do canal, no evento do canal. Os minutos são
   * do evento (é ele que os gera na Cloudflare), não de quem os viu — a
   * pertença decide-se pelo `channel_id` do evento e por mais nada.
   */
  it("os minutos seguem o canal do EVENTO, não o de quem viu", async () => {
    const { canalA, eventoA } = await doisCanaisVistos();
    const forasteiro = await criarUtilizador();

    await criarSessao(forasteiro.id, eventoA.id, janela(10));

    const soA = await getDeliveryByEvent({ all: false, channelIds: [canalA.id] });

    expect(soA.get(eventoA.id)).toEqual({ sessions: 2, minutes: 110, cappedSessions: 0 });
  });
});

/*
 * ============================================================================
 *  O CASO DE REFERÊNCIA, DE PONTA A PONTA E AO CÊNTIMO
 * ============================================================================
 *
 * A regra desta sessão: nenhuma afirmação sobre totais entra sem uma medição.
 * Aqui semeia-se o cenário real da SmokingBars — 131 pagantes a 8,50 €, batalha
 * de 3 h, toda a gente vê tudo — e compara-se o que o ecrã produz com a conta
 * feita à mão, cêntimo a cêntimo.
 */
describe.skipIf(!temBaseDeDados())("o caso da SmokingBars, ao cêntimo", () => {
  beforeEach(limparBase);

  const PAGANTES = 131;
  const PRECO_CENTS = 850;
  const MINUTOS_CADA = 180;

  async function semearBatalha() {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { priceCents: PRECO_CENTS, status: "ended" });

    // Inserções em bloco: 131 idas ao Neon uma a uma eram mais tempo a preparar
    // do que a medir (mesma razão de `criarCanaisComDonos`).
    const pessoas = Array.from({ length: PAGANTES }, (_, i) => ({
      id: newId(),
      name: `Espectador ${i}`,
      email: `espectador-${i}-${newId()}@exemplo.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await db.insert(user).values(pessoas);

    const startedAt = new Date(Date.now() - 300 * MINUTO);
    await Promise.all([
      db.insert(entitlements).values(
        pessoas.map((p) => ({
          id: newId(),
          userId: p.id,
          eventId: evento.id,
          status: "active",
        })),
      ),
      db.insert(playbackSessions).values(
        pessoas.map((p) => ({
          id: newId(),
          userId: p.id,
          eventId: evento.id,
          startedAt,
          lastHeartbeatAt: new Date(startedAt.getTime() + MINUTOS_CADA * MINUTO),
        })),
      ),
    ]);

    return { canal, evento };
  }

  it("produz exatamente os números da conta feita à mão", async () => {
    const { evento } = await semearBatalha();

    const economics = await getPlatformEconomics({ all: true });
    const linha = economics.rows.find((r) => r.eventId === evento.id);

    expect(economics.usdToEur).toBe(DEFAULT_USD_TO_EUR);
    expect(economics.commissionPct).toBe(10);

    // ── minutos: 131 × 180 = 23 580 ───────────────────────────────────────
    expect(linha?.sessions).toBe(PAGANTES);
    expect(linha?.minutes).toBe(23_580);

    // ── receita: 131 × 8,50 € = 1 113,50 € ────────────────────────────────
    expect(linha?.buyers).toBe(PAGANTES);
    expect(linha?.revenueCents).toBe(111_350);

    // ── comissão: 131 × round(850 × 10 %) = 131 × 85 = 111,35 € ───────────
    expect(linha?.commissionCents).toBe(11_135);

    // ── entrega: 23 580 / 1000 × 1 $ = 23,58 $ → × 0,92 = 21,69 € ─────────
    expect(linha?.videoCostUsdCents).toBe(2358);
    expect(linha?.videoCostEurCents).toBe(2169);

    // ── o que sobra: 111,35 − 21,69 = 89,66 € ─────────────────────────────
    expect(linha?.marginCents).toBe(8966);

    // ── e o vídeo come mesmo perto de um quinto da comissão ───────────────
    expect(linha?.costShare).toBeCloseTo(0.1948, 4);
    expect(linha?.health).toBe("normal");
  });

  it("a linha de total é a soma exata das linhas de cima", async () => {
    const { canal } = await semearBatalha();

    // Um segundo evento, para o total ter mesmo o que somar.
    const outro = await criarEvento(canal.id, { priceCents: 500 });
    const pessoa = await criarUtilizador();
    await criarEntitlement(pessoa.id, outro.id, { status: "active" });
    await criarSessao(pessoa.id, outro.id, janela(120));

    const { rows, totals } = await getPlatformEconomics({ all: true });

    expect(rows).toHaveLength(2);
    const soma = (pegar: (r: (typeof rows)[number]) => number) =>
      rows.reduce((acc, r) => acc + pegar(r), 0);

    expect(totals.revenueCents).toBe(soma((r) => r.revenueCents));
    expect(totals.commissionCents).toBe(soma((r) => r.commissionCents));
    expect(totals.videoCostUsdCents).toBe(soma((r) => r.videoCostUsdCents ?? 0));
    expect(totals.videoCostEurCents).toBe(soma((r) => r.videoCostEurCents ?? 0));
    expect(totals.minutes).toBe(soma((r) => r.minutes ?? 0));
    expect(totals.marginCents).toBe(totals.commissionCents - totals.videoCostEurCents);

    // Valores absolutos, para o teste falhar se a semente mudar sem se dar conta.
    expect(totals.revenueCents).toBe(111_350 + 500);
    expect(totals.commissionCents).toBe(11_135 + 50);
    expect(totals.minutes).toBe(23_580 + 120);
    expect(totals.videoCostUsdCents).toBe(2358 + 12); // 120 min = 0,12 $
  });

  /*
   * A COMISSÃO TEM DE SER A MESMA NOS DOIS ECRÃS.
   *
   * O extrato mensal soma `round(preço × pct)` por transação, em SQL. A economia
   * por evento soma `compradores × round(preço × pct)`, em JS. São dois caminhos
   * diferentes para o mesmo número, e dois ecrãs de dinheiro que discordassem
   * em cêntimos eram impossíveis de defender à frente de uma liga.
   *
   * O preço escolhido é o que faz a diferença aparecer: a 8,55 €, 10 % dá 85,5
   * cêntimos — meio cêntimo, o sítio exato onde as duas fórmulas se separam.
   */
  it("a comissão bate certo com a do extrato mensal, ao cêntimo", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { priceCents: 855 });
    const pessoas = await Promise.all(Array.from({ length: 7 }, () => criarUtilizador()));
    await Promise.all(pessoas.map((p) => criarEntitlement(p.id, evento.id, { status: "active" })));

    const [economics, statement] = await Promise.all([
      getPlatformEconomics({ all: true }),
      getMonthlyStatement({ all: true }),
    ]);

    const porEvento = economics.totals.commissionCents;
    const porExtrato = statement.rows.reduce((acc, r) => acc + r.firstrowFeeCents, 0);

    expect(porEvento).toBe(7 * 86); // 602 cêntimos
    expect(porEvento).toBe(porExtrato);
    // E a receita bruta também, que é o outro número partilhado.
    expect(economics.totals.revenueCents).toBe(
      statement.rows.reduce((acc, r) => acc + r.grossCents, 0),
    );
  });

  /*
   * Um evento vendido mas sem uma única sessão medida. Nunca pode aparecer com
   * custo zero — zero parece um facto, e o facto é que não sabemos.
   */
  it("um evento vendido e nunca visto mostra-se como sem dados", async () => {
    const canal = await criarCanal();
    const evento = await criarEvento(canal.id, { priceCents: 850 });
    const pessoa = await criarUtilizador();
    await criarEntitlement(pessoa.id, evento.id, { status: "active" });

    const { rows, totals } = await getPlatformEconomics({ all: true });

    expect(rows).toHaveLength(1);
    expect(rows[0].commissionCents).toBe(85);
    expect(rows[0].minutes).toBeNull();
    expect(rows[0].videoCostEurCents).toBeNull();
    expect(rows[0].marginCents).toBeNull();
    // O ecrã tem de conseguir dizer quantos são — é o que torna a margem total
    // um limite superior assumido em vez de um número falso.
    expect(totals.eventsWithoutDelivery).toBe(1);
  });

  /*
   * Um rascunho que nunca vendeu nem foi visto não tem economia para mostrar —
   * só empurrava para fora do ecrã os eventos que têm.
   */
  it("um evento sem vendas e sem sessões não entra na tabela", async () => {
    const canal = await criarCanal();
    await criarEvento(canal.id);

    const { rows } = await getPlatformEconomics({ all: true });

    expect(rows).toHaveLength(0);
  });
});
