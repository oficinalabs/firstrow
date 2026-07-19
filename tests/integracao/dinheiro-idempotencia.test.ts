import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { entitlements, tickets } from "@/db/schema";
import { activateEntitlement } from "@/server/entitlements";
import { issueTicket } from "@/server/tickets";
import { db, limparBase, temBaseDeDados } from "../apoio/base-de-dados";
import { cenarioBase, criarBilhete, criarEntitlement } from "../apoio/fabrica";
import { cumpridos, emParalelo } from "../apoio/paralelo";

/*
 * ============================================================================
 *  ATIVAÇÃO IDEMPOTENTE — o recibo sai UMA vez, o acesso abre UMA vez
 * ============================================================================
 *
 * A Eupago repete a notificação até receber 200: de 2 em 2 minutos três vezes,
 * depois de hora a hora durante 24 horas. São até 27 chamadas para o mesmo
 * pagamento — e a primeira pode muito bem ainda estar a correr quando a
 * segunda chega.
 *
 * O que segura tudo é uma linha só, em `activateEntitlement` e `issueTicket`:
 * o UPDATE tem `status = 'pending'` no `where` e devolve as linhas mexidas.
 * O Postgres garante que só uma transação vê a linha em `pending`; as outras
 * não mexem em nada e recebem lista vazia. Sem recibo devolvido, o webhook não
 * manda email (ver `app/api/webhooks/eupago/route.ts`).
 *
 * Se isso partir, o cliente recebe 27 emails de recibo do mesmo pagamento — e,
 * no caso do bilhete, um QR novo a cada repetição, o que invalida o que já lhe
 * tinha sido enviado. É o tipo de falha que se descobre pela reclamação.
 */

const REPETICOES_DO_WEBHOOK = 8;

describe.skipIf(!temBaseDeDados())("activateEntitlement", () => {
  beforeEach(limparBase);

  it("abre o acesso e devolve o recibo na primeira confirmação", async () => {
    const { comprador, evento, canal } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    const recibo = await activateEntitlement(compra.id, "ref-1");

    expect(recibo).not.toBeNull();
    expect(recibo?.emailConta).toBe(comprador.email);
    expect(recibo?.canalNome).toBe(canal.name);
    expect(recibo?.valorCents).toBe(evento.priceCents);

    const [linha] = await db.select().from(entitlements).where(eq(entitlements.id, compra.id));
    expect(linha.status).toBe("active");
    expect(linha.providerRef).toBe("ref-1");
  });

  it("não devolve recibo à segunda confirmação — o email não se repete", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    const primeiro = await activateEntitlement(compra.id, "ref-1");
    const segundo = await activateEntitlement(compra.id, "ref-1");

    expect(primeiro).not.toBeNull();
    expect(segundo).toBeNull();
  });

  it("não reescreve a referência do pagamento numa repetição", async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    await activateEntitlement(compra.id, "ref-verdadeira");
    await activateEntitlement(compra.id, "ref-de-uma-repeticao-atrasada");

    const [linha] = await db.select().from(entitlements).where(eq(entitlements.id, compra.id));
    expect(linha.providerRef).toBe("ref-verdadeira");
  });

  it("ignora um identificador que não existe", async () => {
    await expect(activateEntitlement("nao-existe", "ref-1")).resolves.toBeNull();
  });

  /*
   * A REPETIÇÃO EM PARALELO — o caso que a repetição sequencial não cobre.
   *
   * Duas notificações da Eupago podem chegar a duas instâncias da Vercel ao
   * mesmo tempo. Testar em série provava só que a segunda vê a primeira já
   * comprometida; aqui as N partem juntas (ver `tests/apoio/paralelo.ts`) e
   * nenhuma vê o commit das outras.
   *
   * O invariante não depende de quem ganha: exatamente UM recibo.
   */
  it(`devolve um só recibo com ${REPETICOES_DO_WEBHOOK} notificações em paralelo`, async () => {
    const { comprador, evento } = await cenarioBase();
    const compra = await criarEntitlement(comprador.id, evento.id);

    const resultados = await emParalelo(REPETICOES_DO_WEBHOOK, () =>
      activateEntitlement(compra.id, "ref-1"),
    );

    const recibos = cumpridos(resultados).filter((r) => r !== null);
    expect(recibos).toHaveLength(1);
  });
});

describe.skipIf(!temBaseDeDados())("issueTicket", () => {
  beforeEach(limparBase);

  it("emite o QR e devolve o recibo com o preço do bilhete", async () => {
    const { comprador, evento } = await cenarioBase();
    const bilhete = await criarBilhete(comprador.id, evento.id, { priceCents: 1500 });

    const recibo = await issueTicket(bilhete.id, "ref-1");

    expect(recibo?.valorCents).toBe(1500);

    const [linha] = await db.select().from(tickets).where(eq(tickets.id, bilhete.id));
    expect(linha.status).toBe("issued");
    expect(linha.qrToken).toMatch(/^frt_/);
  });

  /*
   * O TOKEN NUNCA SE REGENERA. Se uma repetição do webhook gerasse um QR novo,
   * o que já foi enviado por email deixava de abrir a porta — e a pessoa só
   * descobria à entrada do evento, com a fila atrás.
   */
  it("mantém o mesmo QR quando o webhook se repete", async () => {
    const { comprador, evento } = await cenarioBase();
    const bilhete = await criarBilhete(comprador.id, evento.id);

    await issueTicket(bilhete.id, "ref-1");
    const [depoisDaPrimeira] = await db.select().from(tickets).where(eq(tickets.id, bilhete.id));

    const segundo = await issueTicket(bilhete.id, "ref-1");
    const [depoisDaSegunda] = await db.select().from(tickets).where(eq(tickets.id, bilhete.id));

    expect(segundo).toBeNull();
    expect(depoisDaSegunda.qrToken).toBe(depoisDaPrimeira.qrToken);
  });

  it("não emite a partir de um estado que não seja pending", async () => {
    const { comprador, evento } = await cenarioBase();
    const usado = await criarBilhete(comprador.id, evento.id, { status: "used" });
    const reembolsado = await criarBilhete(comprador.id, evento.id, { status: "refunded" });

    await expect(issueTicket(usado.id, "ref-1")).resolves.toBeNull();
    await expect(issueTicket(reembolsado.id, "ref-1")).resolves.toBeNull();
  });

  it(`emite um só QR com ${REPETICOES_DO_WEBHOOK} notificações em paralelo`, async () => {
    const { comprador, evento } = await cenarioBase();
    const bilhete = await criarBilhete(comprador.id, evento.id);

    const resultados = await emParalelo(REPETICOES_DO_WEBHOOK, () =>
      issueTicket(bilhete.id, "ref-1"),
    );

    const recibos = cumpridos(resultados).filter((r) => r !== null);
    expect(recibos).toHaveLength(1);

    // E ficou UM token — não um por notificação.
    const linhas = await db.select().from(tickets).where(eq(tickets.id, bilhete.id));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].qrToken).toMatch(/^frt_/);
  });
});
