import type { Metadata } from "next";
import { EventForm } from "@/components/admin/event-form";
import { PageHeader } from "@/components/admin/page-header";
import { requireEventManager } from "@/server/event-access";

export const metadata: Metadata = { title: "Criar evento" };

export default async function NewEventPage() {
  // Criar um evento provisiona um live input na Cloudflare, e isso custa
  // dinheiro — só quem gere eventos chega aqui.
  await requireEventManager("/admin/eventos/novo");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Criar evento" backHref="/admin/eventos" backLabel="Eventos" />
      <EventForm />
    </div>
  );
}
