import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BuyButton } from "@/components/checkout/buy-button";
import { CheckoutFrame } from "@/components/checkout/checkout-frame";
import { tenant } from "@/lib/tenant";
import { requireUser } from "@/server/auth-helper";
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

  return (
    <CheckoutFrame>
      <BuyButton
        eventId={eventId}
        eventTitle={event.title}
        startsAt={event.startsAt.toISOString()}
        priceCents={event.priceCents}
        channelName={tenant.name}
      />
    </CheckoutFrame>
  );
}
