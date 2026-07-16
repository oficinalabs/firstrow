import { redirect } from "next/navigation";
import { AdminEventForm } from "@/components/admin/event-form";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/server/auth-helper";
import { listEvents } from "@/server/events";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const user = await requireUser();
  if (!user || !isAdmin(user.email)) redirect("/");

  const events = await listEvents();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-2xl font-medium tracking-tight">Eventos</h1>
      <AdminEventForm />
      <ul className="flex flex-col gap-2 text-sm">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between border-b border-foreground/10 py-2"
          >
            <a href={`/eventos/${e.id}`} className="underline">
              {e.title}
            </a>
            <span className="text-foreground/50">{e.status}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
