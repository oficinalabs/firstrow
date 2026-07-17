import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/eventos/event-card";
import { type EventRow, splitProgram } from "@/components/eventos/program";
import { ViewerFooter } from "@/components/eventos/viewer-footer";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { tenant } from "@/lib/tenant";
import { listEvents } from "@/server/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arquivo",
  description: `Todos os replays do canal ${tenant.name} na FirstRow.`,
};

export default async function VodPage() {
  let archive: EventRow[] | null = null;
  try {
    archive = splitProgram(await listEvents()).archive;
  } catch {
    archive = null;
  }

  return (
    <ViewerShell active="canal">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-5 md:px-8 md:pt-6">
        <SectionHeader
          eyebrow={tenant.name}
          title="Arquivo do canal"
          action={
            <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              ‹ Voltar ao canal
            </Link>
          }
        />

        {archive === null ? (
          <EmptyState
            className="mt-6"
            title="Não conseguimos carregar o arquivo"
            description="Foi um problema do nosso lado. Recarrega a página — se continuar, tenta daqui a uns minutos."
            action={
              <Link href="/vod" className={buttonVariants({ variant: "secondary" })}>
                Recarregar
              </Link>
            }
          />
        ) : archive.length === 0 ? (
          <EmptyState
            className="mt-6"
            title="O arquivo estreia depois da primeira live"
            description="Cada evento fica disponível aqui como replay depois do direto. Volta ao canal para veres a próxima."
            action={
              <Link href="/" className={buttonVariants()}>
                Ver o canal
              </Link>
            }
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 pb-2 md:grid-cols-4 md:gap-5">
            {archive.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
      <ViewerFooter />
    </ViewerShell>
  );
}
