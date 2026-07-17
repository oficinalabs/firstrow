import Link from "next/link";
import { redirect } from "next/navigation";
import { QrCard } from "@/components/tickets/qr-card";
import { TicketRow } from "@/components/tickets/ticket-row";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { requireUser } from "@/server/auth-helper";
import { listTicketsByUser, shortCode } from "@/server/tickets";

export const dynamic = "force-dynamic";

export default async function BilhetesPage() {
  const user = await requireUser();
  if (!user) redirect("/entrar");

  const bilhetes = await listTicketsByUser(user.id);
  const porUsar = bilhetes.filter((t) => t.status === "issued" && t.qrToken);
  const usados = bilhetes.filter((t) => t.status === "used");

  return (
    <ViewerShell active="bilhetes">
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6 pb-10">
        <h1 className="font-display text-xl font-extrabold tracking-display">Os meus bilhetes</h1>

        {bilhetes.length === 0 ? (
          <EmptyState
            title="Ainda não tens bilhetes"
            description="Quando comprares um bilhete para um evento, o QR de entrada aparece aqui."
            action={
              <Link href="/" className={buttonVariants({ variant: "secondary" })}>
                Ver a agenda
              </Link>
            }
          />
        ) : (
          <>
            {porUsar.map((t) => (
              <QrCard
                key={t.id}
                qrToken={t.qrToken as string}
                codigo={shortCode(t.qrToken as string)}
                titulo={t.eventoTitulo}
                startsAt={t.eventoStartsAt}
                nome={user.name}
                priceCents={t.priceCents}
              />
            ))}
            {usados.length > 0 ? (
              <div className="mt-2 flex flex-col gap-2.5">
                {porUsar.length > 0 ? (
                  <p className="font-mono text-2xs font-medium uppercase tracking-label text-muted-foreground">
                    Passados
                  </p>
                ) : null}
                {usados.map((t) => (
                  <TicketRow
                    key={t.id}
                    titulo={t.eventoTitulo}
                    startsAt={t.eventoStartsAt}
                    usedAt={t.usedAt}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>
    </ViewerShell>
  );
}
