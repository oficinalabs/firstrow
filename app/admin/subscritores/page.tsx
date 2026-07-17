import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatEuro, formatNumber } from "@/lib/format";
import { type BuyerRow, listBuyers } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Subscritores" };

// Fase 0: compradores únicos de PPV. Subscrições mensais (tiers, MRR) ficam
// para a fase seguinte — a recorrência Eupago ainda não está confirmada.
export default async function SubscribersPage() {
  const buyers = await listBuyers();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Subscritores"
        meta={`${formatNumber(buyers.length)} compradores · subscrições mensais na próxima fase`}
      />

      {buyers.length > 0 ? (
        <Card>
          <CardContent className="pt-2">
            <DataTable<BuyerRow>
              columns={[
                {
                  header: "Comprador",
                  cell: (b) => <span className="font-semibold">{b.name}</span>,
                },
                {
                  header: "Email",
                  cell: (b) => (
                    <span className="font-mono text-xs text-muted-foreground">{b.email}</span>
                  ),
                },
                { header: "Compras", numeric: true, cell: (b) => formatNumber(b.purchases) },
                {
                  header: "Última compra",
                  numeric: true,
                  cell: (b) => (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(b.lastPurchaseAt)}
                    </span>
                  ),
                },
                { header: "Total", numeric: true, cell: (b) => formatEuro(b.totalCents) },
              ]}
              rows={buyers}
              rowKey={(b) => b.userId}
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          className="mt-4"
          title="Ainda sem compradores"
          description="Quando alguém comprar acesso a um evento, o nome, o email e o histórico de compras aparecem aqui."
          action={
            <Link href="/admin/eventos" className={buttonVariants({ variant: "secondary" })}>
              Ver eventos
            </Link>
          }
        />
      )}
    </div>
  );
}
