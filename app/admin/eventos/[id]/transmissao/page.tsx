import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyField } from "@/components/admin/copy-field";
import { DataTable } from "@/components/admin/data-table";
import { EventStatusActions } from "@/components/admin/event-status-actions";
import { EventStatusBadge } from "@/components/admin/event-status-badge";
import { LiveViewers } from "@/components/admin/live-viewers";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEuro, formatNumber, formatTime } from "@/lib/format";
import { getEvent } from "@/server/events";
import {
  type BlockedSession,
  countActiveViewers,
  getEventSales,
  listBlockedSessionsToday,
} from "@/server/stats";
import { getStreamCredentials } from "./stream-credentials";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transmissão" };

const STATUS_HELP: Record<string, string> = {
  draft: "Liga o OBS com as credenciais acima e começa quando estiveres pronto.",
  live: "Está no ar — quem comprou acesso consegue ver.",
  ended: "Transmissão terminada. Podes voltar a rascunho se foi engano.",
};

export default async function TransmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const [sales, viewers, blocked, credentials] = await Promise.all([
    getEventSales(id),
    countActiveViewers(id),
    listBlockedSessionsToday(id),
    event.cfLiveInputId ? getStreamCredentials(event.cfLiveInputId) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title={event.title}
        badge={<EventStatusBadge status={event.status} />}
        backHref="/admin/eventos"
        backLabel="Eventos"
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3.5">
          <LiveViewers
            eventId={event.id}
            initial={{ viewers, blockedToday: blocked.total }}
            isLive={event.status === "live"}
          />

          <Card>
            <CardHeader className="flex-row items-baseline justify-between">
              <CardTitle>Sessões bloqueadas · hoje</CardTitle>
              <span className="font-mono text-2xs text-muted-foreground">
                1 sessão por conta · a nova corta a antiga
              </span>
            </CardHeader>
            <CardContent>
              <DataTable<BlockedSession>
                columns={[
                  {
                    header: "Conta",
                    cell: (s) => <span className="font-mono text-xs">{s.email}</span>,
                  },
                  {
                    header: "Motivo",
                    cell: () => (
                      <span className="text-muted-foreground">2ª sessão na mesma conta</span>
                    ),
                  },
                  { header: "Hora", numeric: true, cell: (s) => formatTime(s.revokedAt) },
                ]}
                rows={blocked.rows}
                rowKey={(s) => s.id}
                empty={
                  <p className="py-4 text-2sm text-muted-foreground">
                    Nenhuma sessão bloqueada hoje.
                  </p>
                }
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card>
            <CardHeader>
              <CardTitle>Ligação OBS</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3.5">
              {credentials ? (
                <>
                  <CopyField label="Servidor RTMPS" value={credentials.rtmpsUrl} />
                  <CopyField label="Chave da stream" value={credentials.streamKey} masked />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    A chave é deste evento. Nunca a mostres em stream nem a partilhes fora da régie.
                  </p>
                </>
              ) : (
                <p className="text-2sm leading-relaxed text-muted-foreground">
                  Não deu para ir buscar as credenciais à Cloudflare. Confirma o
                  CLOUDFLARE_ACCOUNT_ID e o token no .env e recarrega a página.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado da stream</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3.5">
              <p className="text-2sm leading-relaxed text-muted-foreground">
                {STATUS_HELP[event.status] ?? ""}
              </p>
              <EventStatusActions eventId={event.id} status={event.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Neste evento</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between text-2sm">
                <span className="text-muted-foreground">Acessos vendidos</span>
                <span className="font-mono font-medium tabular-nums">
                  {formatNumber(sales.buyers)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-2sm">
                <span className="text-muted-foreground">Receita</span>
                <span className="font-mono font-medium tabular-nums">
                  {formatEuro(sales.revenueCents)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
