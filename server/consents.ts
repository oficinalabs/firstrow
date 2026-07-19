import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { type ConsentKind, purchaseConsents } from "@/db/schema";
import { newId } from "@/lib/ids";
import { clientIp } from "@/lib/rate-limit";

/*
 * ============================================================================
 *  PROVA DE CONSENTIMENTO — escrita e leitura
 * ============================================================================
 *
 * A tabela existe desde a Frente E (ver o comentário longo em `db/schema.ts`,
 * que explica porque é que nada aqui é `cascade`). Este ficheiro é quem lhe
 * escreve — até agora ninguém escrevia, e uma tabela de prova vazia é o mesmo
 * que não haver prova.
 *
 * ORDEM NO CHECKOUT, E A RAZÃO DELA
 * A gravação acontece **antes** de se pedir a cobrança à Eupago. Se a gravação
 * falhar, a compra rebenta e ninguém é cobrado — que é o lado certo para
 * falhar. Ao contrário, se a cobrança viesse primeiro, uma falha aqui deixava
 * dinheiro cobrado sem prova nenhuma de que a pessoa aceitou o quê.
 *
 * Por isso `guardarConsentimento` **deixa passar o erro**: não tem try/catch a
 * engolir falhas como `recordChargeReference` tem. Ali engolir é certo (perder
 * a referência é chato, perder a compra é pior); aqui é o contrário.
 */

/** Qual das duas compras é que este consentimento cobre. */
export type TipoDeCompra = "entitlement" | "ticket";

export type NovoConsentimento = {
  compra: { tipo: TipoDeCompra; id: string };
  userId: string;
  /** Copiado para a linha: a prova sobrevive ao apagar da conta. */
  userEmail: string;
  eventId: string;
  /** Copiado para a linha, pela mesma razão. */
  eventTitle: string;
  kind: ConsentKind;
  /** O texto exato mostrado — vem de `lib/legal/consentimentos.ts`, nunca do cliente. */
  texto: string;
  versao: string;
  /** `null` quando o caso não tem checkbox (bilhete presencial). */
  checkboxAceite: boolean | null;
  /** O pedido HTTP, para tirar IP e user-agent. */
  req: Request;
};

/**
 * O IP, tal como a plataforma o vê — ou nada.
 *
 * `clientIp` devolve "local" quando não há proxy à frente (desenvolvimento).
 * Numa coluna de prova isso seria ruído a fingir-se de dado: preferimos NULL,
 * que diz a verdade — não sabemos de onde veio.
 */
function ipDaProva(req: Request): string | null {
  const ip = clientIp(req);
  return ip === "local" ? null : ip;
}

/**
 * Grava a prova. Uma linha por aceitação — se a pessoa voltar ao checkout e
 * aceitar outra vez, ficam as duas (ver `db/schema.ts`: é um registo em
 * acrescento, de propósito).
 */
export async function guardarConsentimento(c: NovoConsentimento): Promise<void> {
  await db.insert(purchaseConsents).values({
    id: newId(),
    userId: c.userId,
    eventId: c.eventId,
    entitlementId: c.compra.tipo === "entitlement" ? c.compra.id : null,
    ticketId: c.compra.tipo === "ticket" ? c.compra.id : null,
    userEmail: c.userEmail,
    eventTitle: c.eventTitle,
    kind: c.kind,
    consentText: c.texto,
    textVersion: c.versao,
    checkboxAccepted: c.checkboxAceite,
    ipAddress: ipDaProva(c.req),
    // O user-agent tem limite generoso mas não infinito: cortamos para o campo
    // não virar um saco de texto arbitrário vindo do cliente.
    userAgent: c.req.headers.get("user-agent")?.slice(0, 512) ?? null,
  });
}

/**
 * O texto aceite numa compra — para o email de confirmação o reproduzir, como
 * exige a secção 6 de `docs/legal/CONTEUDO-PAGINAS.md`.
 *
 * A mais recente, porque a tabela é em acrescento: se houve várias tentativas,
 * a que interessa é a da aceitação que levou ao pagamento.
 */
export async function textoConsentidoNaCompra(
  tipo: TipoDeCompra,
  id: string,
): Promise<string | null> {
  const coluna =
    tipo === "entitlement" ? purchaseConsents.entitlementId : purchaseConsents.ticketId;
  const [linha] = await db
    .select({ texto: purchaseConsents.consentText })
    .from(purchaseConsents)
    .where(eq(coluna, id))
    .orderBy(desc(purchaseConsents.createdAt))
    .limit(1);
  return linha?.texto ?? null;
}
