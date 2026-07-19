import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatEuro, formatNumber } from "@/lib/format";
import { manageScope, requireUser } from "@/server/authz";
import { getMonthlyStatement, type MonthlyStatementRow } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ganhos" };

// O extrato é do dinheiro DOS CANAIS desta pessoa. Sem âmbito, esta era a
// página que somava a faturação de todas as ligas na mesma tabela.
export default async function EarningsPage() {
  const user = await requireUser({ next: "/admin/ganhos" });
  const { commissionPct, rows } = await getMonthlyStatement(manageScope(user));

  const totals = rows.reduce(
    (acc, r) => ({
      purchases: acc.purchases + r.purchases,
      grossCents: acc.grossCents + r.grossCents,
      firstrowFeeCents: acc.firstrowFeeCents + r.firstrowFeeCents,
      eupagoFeeCents: acc.eupagoFeeCents + r.eupagoFeeCents,
      netCents: acc.netCents + r.netCents,
    }),
    { purchases: 0, grossCents: 0, firstrowFeeCents: 0, eupagoFeeCents: 0, netCents: 0 },
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Ganhos" meta="bruto → taxas → líquido, sempre ao cêntimo" />

      {rows.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-2">
            <DataTable<MonthlyStatementRow>
              columns={[
                {
                  header: "Mês",
                  cell: (r) => <span className="font-semibold">{r.monthLabel}</span>,
                },
                { header: "Compras", numeric: true, cell: (r) => formatNumber(r.purchases) },
                { header: "Bruto", numeric: true, cell: (r) => formatEuro(r.grossCents) },
                {
                  header: `Taxa FirstRow · ${commissionPct}%`,
                  numeric: true,
                  className: "text-destructive",
                  cell: (r) => formatEuro(-r.firstrowFeeCents),
                },
                {
                  header: "Taxa Eupago · est.",
                  numeric: true,
                  className: "text-destructive",
                  cell: (r) => formatEuro(-r.eupagoFeeCents),
                },
                {
                  header: "Líquido",
                  numeric: true,
                  className: "font-semibold",
                  cell: (r) => formatEuro(r.netCents),
                },
              ]}
              rows={rows}
              rowKey={(r) => r.monthKey}
              footer={
                <TableRow className="border-t-2 border-border font-semibold hover:bg-transparent">
                  <TableCell>Total</TableCell>
                  <TableCell numeric>{formatNumber(totals.purchases)}</TableCell>
                  <TableCell numeric>{formatEuro(totals.grossCents)}</TableCell>
                  <TableCell numeric className="text-destructive">
                    {formatEuro(-totals.firstrowFeeCents)}
                  </TableCell>
                  <TableCell numeric className="text-destructive">
                    {formatEuro(-totals.eupagoFeeCents)}
                  </TableCell>
                  <TableCell numeric className="font-semibold">
                    {formatEuro(totals.netCents)}
                  </TableCell>
                </TableRow>
              }
            />
            <p className="border-t-2 border-accent pt-2.5 font-mono text-2xs leading-relaxed text-muted-foreground">
              Taxa Eupago estimada: 0,07 € + 0,7% por transação MB WAY — o valor certo está no
              extrato Eupago. A taxa FirstRow ({commissionPct}%) sai no split de cada pagamento.
            </p>
            {/* TODO(frente-d): somar bilhetes físicos ao extrato quando existirem. */}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          className="mt-4"
          title="Sem movimentos"
          description="O extrato aparece com a primeira venda: bruto, taxa FirstRow, taxa Eupago estimada e líquido, mês a mês."
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
