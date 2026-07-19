import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime, formatEuro, formatNumber, formatTime } from "@/lib/format";
import { manageScope, requireUser } from "@/server/authz";
import { getDashboardStats, listRecentPayments, type RecentPayment } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard" };

// Hoje mostra a hora; dias anteriores mostram a data.
function paymentWhen(createdAt: Date): string {
  return formatDate(createdAt) === formatDate(new Date())
    ? formatTime(createdAt)
    : formatDate(createdAt);
}

/*
 * O âmbito é o que esta página tem de defesa própria, e vale a pena dizer
 * porquê: o layout corre EM PARALELO com a página (ver a nota em
 * `app/admin/layout.tsx`), por isso as queries daqui já correram quando o gate
 * do layout decide. Antes, isso queria dizer que os números da liga iam para o
 * payload de quem não os devia ver. Agora as queries levam os canais desta
 * pessoa: quem não gere nenhum recebe zeros, não a receita de toda a gente.
 */
export default async function AdminDashboardPage() {
  const user = await requireUser({ next: "/admin" });
  const scope = manageScope(user);

  const [stats, payments] = await Promise.all([
    getDashboardStats(scope),
    listRecentPayments(scope, 6),
  ]);
  const monthName = stats.monthLabel.split(" ")[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Dashboard" meta={`${stats.monthLabel} · atualizado agora`} />

      {stats.hasEvents ? (
        <>
          <div className="grid gap-3.5 md:grid-cols-3">
            <StatCard
              label={`Receita · ${monthName}`}
              value={formatEuro(stats.monthRevenueCents)}
              hint={`${formatNumber(stats.monthPurchases)} compras este mês`}
              hintTone={stats.monthPurchases > 0 ? "success" : "muted"}
            />
            <StatCard
              label="Compradores"
              value={formatNumber(stats.buyersTotal)}
              hint="contas com acesso comprado"
            />
            {stats.nextEvent ? (
              <StatCard
                label={stats.nextEvent.status === "live" ? "Agora no ar" : "Próxima live"}
                value={stats.nextEvent.title}
                valueClassName="font-sans text-base font-bold"
                hint={formatDateTime(stats.nextEvent.startsAt)}
              />
            ) : (
              <StatCard
                label="Próxima live"
                value="—"
                hint={
                  <Link href="/admin/eventos/novo" className="underline underline-offset-4">
                    agenda o próximo evento
                  </Link>
                }
              />
            )}
          </div>

          <Card>
            <CardHeader className="flex-row items-baseline justify-between">
              <CardTitle>Últimos pagamentos</CardTitle>
              <span className="font-mono text-2xs uppercase tracking-label text-muted-foreground">
                só PPV, por agora
              </span>
            </CardHeader>
            <CardContent>
              <DataTable<RecentPayment>
                columns={[
                  {
                    header: "Quando",
                    cell: (p) => (
                      <span className="font-mono text-xs text-muted-foreground">
                        {paymentWhen(p.createdAt)}
                      </span>
                    ),
                  },
                  { header: "Comprador", cell: (p) => p.buyerName },
                  {
                    header: "Tipo",
                    cell: () => <span className="text-muted-foreground">Acesso à live</span>,
                  },
                  {
                    header: "Evento",
                    cell: (p) => <span className="text-muted-foreground">{p.eventTitle}</span>,
                  },
                  { header: "Valor", numeric: true, cell: (p) => formatEuro(p.amountCents) },
                ]}
                rows={payments}
                rowKey={(p) => p.id}
                empty={
                  <p className="py-4 text-2sm text-muted-foreground">
                    Ainda sem pagamentos — partilha a página do evento para abrir as vendas.
                  </p>
                }
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState
          className="mt-4"
          title="Cria o primeiro evento"
          description="Assim que o primeiro evento estiver criado, a receita, os compradores e os pagamentos aparecem aqui."
          action={
            <Link href="/admin/eventos/novo" className={buttonVariants({ size: "lg" })}>
              Criar evento
            </Link>
          }
        />
      )}
    </div>
  );
}
