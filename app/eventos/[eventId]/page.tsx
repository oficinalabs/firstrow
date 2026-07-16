import { notFound } from "next/navigation";
import { BuyButton } from "@/components/checkout/buy-button";
import { requireUser } from "@/server/auth-helper";
import { hasActiveEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) notFound();

  const user = await requireUser();
  const entitled = user ? await hasActiveEntitlement(user.id, eventId) : false;
  const priceLabel = `${(event.priceCents / 100).toFixed(2).replace(".", ",")}€`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div>
        <p className="text-sm uppercase tracking-widest text-foreground/50">Evento</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">{event.title}</h1>
        <p className="mt-2 text-foreground/60">
          {new Intl.DateTimeFormat("pt-PT", { dateStyle: "long", timeStyle: "short" }).format(
            event.startsAt,
          )}
        </p>
      </div>

      {!user ? (
        <a href="/entrar" className="text-sm font-medium underline">
          Entra para comprar acesso
        </a>
      ) : entitled ? (
        <a
          href={`/eventos/${eventId}/ver`}
          className="inline-flex h-11 w-fit items-center rounded-lg bg-foreground px-5 text-sm font-medium text-background"
        >
          Ver em direto
        </a>
      ) : (
        <BuyButton eventId={eventId} priceLabel={priceLabel} />
      )}
    </main>
  );
}
