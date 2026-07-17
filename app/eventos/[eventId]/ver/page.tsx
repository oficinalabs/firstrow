import { redirect } from "next/navigation";
import { EventCard } from "@/components/eventos/event-card";
import { splitProgram } from "@/components/eventos/program";
import { WatchPlayer } from "@/components/player/watch-player";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { formatDateTime } from "@/lib/format";
import { tenant } from "@/lib/tenant";
import { requireUser } from "@/server/auth-helper";
import { hasActiveEntitlement } from "@/server/entitlements";
import { getEvent, listEvents } from "@/server/events";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const user = await requireUser();
  if (!user) redirect(`/eventos/${eventId}`);

  const event = await getEvent(eventId);
  if (!event) redirect("/");
  if (!(await hasActiveEntitlement(user.id, eventId))) redirect(`/eventos/${eventId}`);

  const isVod = event.status === "ended" && Boolean(event.cfVodUid);
  const archive = isVod
    ? splitProgram(await listEvents()).archive.filter((e) => e.id !== eventId)
    : [];

  const meta = isVod
    ? `Gravado a ${formatDateTime(event.startsAt)} · ${tenant.name}`
    : `${formatDateTime(event.startsAt)} · Em direto · ${tenant.name}`;

  const info = (
    <div className="border-b pb-4">
      <h1 className="font-display text-xl font-extrabold tracking-display md:text-2xl">
        {event.title}
      </h1>
      <p className="mt-1.5 text-2sm text-muted-foreground">{meta}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        Sessão pessoal — uma reprodução em simultâneo por conta. Se abrires noutro dispositivo, esta
        pára.
      </p>
    </div>
  );

  return (
    <ViewerShell>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 md:py-6">
        {isVod && archive.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div>
              <WatchPlayer eventId={eventId} watermark={user.email} mode="vod" />
              <div className="mt-4">{info}</div>
            </div>
            <aside aria-label="Arquivo do canal">
              <h2 className="mb-2.5 font-display text-base font-bold">Arquivo do canal</h2>
              <div className="flex flex-col">
                <EventCard event={event} layout="row" active />
                {archive.map((e) => (
                  <EventCard key={e.id} event={e} layout="row" />
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <WatchPlayer eventId={eventId} watermark={user.email} mode={isVod ? "vod" : "live"} />
            <div className="mt-4">{info}</div>
          </div>
        )}
      </div>
    </ViewerShell>
  );
}
