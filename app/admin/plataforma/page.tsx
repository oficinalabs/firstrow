import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatEuro, formatNumber } from "@/lib/format";
import { isPlatformAdmin, requireUser } from "@/server/authz";
import { getPlatformTotals } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Plataforma" };

/*
 * Admin interno FirstRow — low-fi de propósito (ver design Backoffice.dc.html).
 *
 * É a única página do backoffice que mostra números SEM âmbito de canal: conta
 * as contas todas, os eventos todos e a receita toda. Por isso é a única com
 * gate a `platform_admin`, e não ao papel do canal.
 *
 * Até esta frente vivia só com o gate do layout, que deixava entrar um dono de
 * liga — e ele via daqui a receita acumulada da plataforma inteira e quantas
 * contas existem. `notFound()` e não 403: quem não é da FirstRow não precisa
 * sequer de saber que este ecrã existe.
 */
export default async function PlatformPage() {
  const user = await requireUser({ next: "/admin/plataforma" });
  if (!isPlatformAdmin(user)) notFound();

  const totals = await getPlatformTotals();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Plataforma" meta="admin interno FirstRow · low-fi" />
      <div className="grid gap-3.5 md:grid-cols-3">
        <StatCard label="Utilizadores" value={formatNumber(totals.users)} hint="contas criadas" />
        <StatCard label="Eventos" value={formatNumber(totals.events)} hint="todos os estados" />
        <StatCard
          label="Receita total"
          value={formatEuro(totals.revenueCents)}
          hint="PPV desde o início"
        />
      </div>
      <p className="font-mono text-2xs leading-relaxed text-muted-foreground">
        Um só canal nesta fase. A vista por canais (GMV, taxa gerada, estado) chega com o
        multi-tenant na Fase 2.
      </p>
    </div>
  );
}
