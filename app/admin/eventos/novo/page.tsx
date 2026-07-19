import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/admin/event-form";
import { PageHeader } from "@/components/admin/page-header";
import { canEnterBackoffice, requireUser } from "@/server/authz";

export const metadata: Metadata = { title: "Criar evento" };

export default async function NewEventPage() {
  /*
   * Criar um evento provisiona um live input na Cloudflare, e isso custa
   * dinheiro — só quem é dono de algum canal chega aqui.
   *
   * Ao contrário dos outros ecrãs de evento, este não tem um evento de onde
   * tirar o canal (é o que vai nascer). O gate possível é o genérico; EM QUE
   * canal nasce decide-se na action, em `resolveChannelForNewEvent`.
   */
  const user = await requireUser({ next: "/admin/eventos/novo" });
  if (!canEnterBackoffice(user)) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Criar evento" backHref="/admin/eventos" backLabel="Eventos" />
      <EventForm />
    </div>
  );
}
