import type { Metadata } from "next";
import { EventForm } from "@/components/admin/event-form";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "Criar evento" };

export default function NewEventPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Criar evento" backHref="/admin/eventos" backLabel="Eventos" />
      <EventForm />
    </div>
  );
}
