import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BuyButton } from "@/components/checkout/buy-button";
import { CheckoutFrame } from "@/components/checkout/checkout-frame";
import { requireUser } from "@/server/auth-helper";
import { getChannelById } from "@/server/channels";
import { hasActiveEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmar a compra",
  robots: { index: false },
};

export default async function CheckoutPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const event = await getEvent(eventId);
  if (!event) notFound();

  const user = await requireUser();
  if (!user) redirect(`/entrar?next=/eventos/${eventId}/comprar`);

  // Já tem acesso — não faz sentido comprar outra vez.
  if (await hasActiveEntitlement(user.id, eventId)) redirect(`/eventos/${eventId}`);

  // O ecrã de pagamento tem de dizer a quem se está a pagar. O nome vem do
  // canal DO EVENTO: mostrar aqui o canal errado é o pior sítio para o fazer.
  const channel = await getChannelById(event.channelId);

  return (
    <CheckoutFrame>
      <BuyButton
        eventId={eventId}
        eventTitle={event.title}
        startsAt={event.startsAt.toISOString()}
        priceCents={event.priceCents}
        channelName={channel?.name ?? ""}
      />
    </CheckoutFrame>
  );
}
