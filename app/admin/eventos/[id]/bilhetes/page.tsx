import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BuyersTable } from "@/components/tickets/buyers-table";
import { StatCard } from "@/components/tickets/stat-card";
import { BackofficeShell } from "@/components/ui/backoffice-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { isAdmin } from "@/lib/admin";
import { formatDate, formatEuro, formatNumber, formatTime } from "@/lib/format";
import { requireUser } from "@/server/auth-helper";
import { getEvent } from "@/server/events";
import { getEventTicketStats, listTicketsByEvent, shortCode } from "@/server/tickets";

export const dynamic = "force-dynamic";

export default async function AdminEventoBilhetesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user || !isAdmin(user.email)) redirect("/");

  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const [stats, bilhetes] = await Promise.all([getEventTicketStats(id), listTicketsByEvent(id)]);
  const porUsar = stats.vendidos - stats.entraram;

  return (
    <BackofficeShell activeHref="/admin/eventos">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div>
          <Link
            href="/admin/eventos"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ‹ Eventos
          </Link>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-xl font-extrabold tracking-display">{event.title}</h1>
            <div className="flex gap-2.5">
              <a
                href={`/admin/eventos/${id}/bilhetes/export`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Exportar CSV
              </a>
              <Link href={`/admin/scanner?evento=${id}`} className={buttonVariants({ size: "sm" })}>
                Abrir scanner de porta
              </Link>
            </div>
          </div>
        </div>

        {event.ticketPriceCents == null ? (
          <EmptyState
            title="Este evento não tem bilhetes à venda"
            description="Define o preço e a lotação do bilhete físico ao editar o evento para começares a vender."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              <StatCard
                label="Vendidos"
                value={formatNumber(stats.vendidos)}
                sub={
                  event.ticketCapacity != null
                    ? `/${formatNumber(event.ticketCapacity)}`
                    : undefined
                }
              />
              <StatCard label="Receita bilhetes" value={formatEuro(stats.receitaCents)} />
              <StatCard label="Já entraram" value={formatNumber(stats.entraram)} tone="success" />
              <StatCard label="Por usar" value={formatNumber(porUsar)} />
            </div>

            <Card className="px-4.5 py-4">
              {bilhetes.length === 0 ? (
                <EmptyState
                  className="border-0"
                  title="Ainda sem bilhetes vendidos"
                  description="Assim que houver compras confirmadas por MB WAY, os compradores aparecem aqui."
                />
              ) : (
                <BuyersTable
                  rows={bilhetes.map((t) => ({
                    id: t.id,
                    codigo: t.qrToken ? shortCode(t.qrToken) : null,
                    nome: t.nome,
                    email: t.email,
                    comprado: formatDate(t.createdAt),
                    estado: t.status,
                    usadoAs: t.usedAt ? formatTime(t.usedAt) : null,
                  }))}
                />
              )}
            </Card>
          </>
        )}
      </div>
    </BackofficeShell>
  );
}
