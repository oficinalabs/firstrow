import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatEuro, formatNumber } from "@/lib/format";
import { manageScope, requireUser } from "@/server/authz";
import { channelsInScope } from "@/server/channels";
import { type BuyerRow, listBuyers } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Subscritores" };

/*
 * Fase 0: compradores únicos de PPV. Subscrições mensais (tiers, MRR) ficam
 * para a fase seguinte — a recorrência Eupago ainda não está confirmada.
 *
 * Esta página mostra NOME e EMAIL. É a que mais precisa do âmbito: sem ele,
 * abrir o backoffice de uma liga dava a lista de contactos de todas as outras.
 *
 * A lista continua a ser de PESSOAS e não de pessoas-por-canal, mesmo com
 * vários canais: quem comprou nas duas ligas é um comprador, não dois, e
 * duplicá-lo inflacionava a contagem do cabeçalho. O que o cabeçalho passa a
 * dizer é de quantos canais é este público — senão "84 compradores" não
 * distingue uma liga com 84 de duas com 42 cada.
 */
export default async function SubscribersPage() {
  const user = await requireUser({ next: "/admin/subscritores" });
  const scope = manageScope(user);
  const [buyers, channels] = await Promise.all([listBuyers(scope), channelsInScope(scope)]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Subscritores"
        meta={
          channels.many
            ? `${formatNumber(buyers.length)} compradores · ${formatNumber(channels.list.length)} canais`
            : `${formatNumber(buyers.length)} compradores · subscrições mensais na próxima fase`
        }
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
