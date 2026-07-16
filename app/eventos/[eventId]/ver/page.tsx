import { redirect } from "next/navigation";
import { WatchPlayer } from "@/components/player/watch-player";
import { requireUser } from "@/server/auth-helper";
import { hasActiveEntitlement } from "@/server/entitlements";
import { getEvent } from "@/server/events";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const user = await requireUser();
  if (!user) redirect(`/eventos/${eventId}`);

  const event = await getEvent(eventId);
  if (!event) redirect("/");
  if (!(await hasActiveEntitlement(user.id, eventId))) redirect(`/eventos/${eventId}`);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-xl font-medium tracking-tight">{event.title}</h1>
      <WatchPlayer eventId={eventId} watermark={user.email} />
      <p className="text-xs text-foreground/40">
        Sessão pessoal · uma reprodução em simultâneo por conta.
      </p>
    </main>
  );
}
