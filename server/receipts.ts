import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { channels, events } from "@/db/schema";

export type ReceiptData = {
  nome: string | null;
  emailConta: string;
  eventoTitulo: string;
  eventoData: Date;
  valorCents: number;
  eventId: string;
  /** O canal que vendeu — vem do evento, e é o que o recibo tem de nomear. */
  canalNome: string;
};

/*
 * Junta os dados do recibo (comprador + evento + canal) de um pagamento
 * confirmado. `valorCents` permite passar o preço do bilhete; se omitido usa o
 * preço PPV do evento. Partilhado por entitlements e tickets (DRY) — ver o
 * webhook Eupago.
 *
 * O nome do canal passou a sair DAQUI, e não de uma constante do lado de quem
 * envia o email: o recibo de uma compra tem de dizer a liga certa, e o webhook
 * não tem como a saber sem ser pelo evento. Com duas ligas, a constante
 * mandava a toda a gente um recibo com o nome da primeira.
 */
export async function buildReceipt(
  userId: string,
  eventId: string,
  valorCents?: number,
): Promise<ReceiptData | null> {
  const [u] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const [e] = await db
    .select({
      title: events.title,
      startsAt: events.startsAt,
      priceCents: events.priceCents,
      canalNome: channels.name,
    })
    .from(events)
    .innerJoin(channels, eq(channels.id, events.channelId))
    .where(eq(events.id, eventId))
    .limit(1);
  if (!u || !e) return null;

  return {
    nome: u.name,
    emailConta: u.email,
    eventoTitulo: e.title,
    eventoData: e.startsAt,
    valorCents: valorCents ?? e.priceCents,
    eventId,
    canalNome: e.canalNome,
  };
}
