import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatEuro, formatNumber } from "@/lib/format";
import { getPlatformTotals } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Plataforma" };

// Admin interno FirstRow — low-fi de propósito (ver design Backoffice.dc.html).
// Multi-canal (lista de canais, GMV por canal) é Fase 2.
export default async function PlatformPage() {
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
