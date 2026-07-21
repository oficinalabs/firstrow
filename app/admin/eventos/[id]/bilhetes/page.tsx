import Link from "next/link";
import { BuyersTable } from "@/components/tickets/buyers-table";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatEuro, formatNumber, formatTime } from "@/lib/format";
import { canManageEvents, operateScope } from "@/server/authz";
import { channelsInScope } from "@/server/channels";
import { requireEventOperator } from "@/server/event-access";
import { getEventTicketStats, listTicketsByEvent, shortCode } from "@/server/tickets";

export const dynamic = "force-dynamic";

export default async function AdminEventoBilhetesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Quem opera a porta valida bilhetes, por isso também vê esta lista — mas só
  // a dos eventos do seu canal. Esta página traz nomes e emails de compradores.
  const { user, event } = await requireEventOperator(id, `/admin/eventos/${id}/bilhetes`);

  const [stats, bilhetes, channels] = await Promise.all([
    getEventTicketStats(id),
    listTicketsByEvent(id),
    channelsInScope(operateScope(user)),
  ]);
  const porUsar = stats.vendidos - stats.entraram;
  // O papel NESTE canal, não o papel da pessoa: quem é dono de uma liga e
  // equipa noutra vê a receita numa e não na outra.
  const canManage = canManageEvents(user, event.channelId);
  // De que liga são estes compradores — só quando há mais do que uma (a lista
  // leva nomes e emails, e exporta-se para CSV logo ali ao lado).
  const channel = channels.many ? channels.byId.get(event.channelId) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div>
        <Link
          href="/admin/eventos"
          className="alvo-toque text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ‹ Eventos
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <h1 className="font-display text-xl font-extrabold tracking-display">{event.title}</h1>
            {channel ? (
              <span className="font-mono text-xs text-muted-foreground">{channel.name}</span>
            ) : null}
          </div>
          <div className="flex gap-2.5">
            {/* O export é `canManageEvents` do lado do servidor (responde 404 a
                quem não seja dono). Mostrá-lo à equipa da porta era oferecer um
                botão que não faz nada — esconder é cortesia, o gate é lá. */}
            {canManage ? (
              <a
                href={`/admin/eventos/${id}/bilhetes/export`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Exportar CSV
              </a>
            ) : null}
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
          {/*
           * Vendidos / entraram / por usar são OPERACIONAIS — é o que quem está
           * à porta precisa de saber para gerir a fila e a lotação. A receita
           * não é: é o dinheiro da liga, e este ecrã abre-se com
           * `canOperateEvents`, ou seja também à equipa.
           *
           * Medido com sessão de staff: antes disto, o corpo desta página
           * trazia "Receita bilhetes" e o valor. A grelha passa a três colunas
           * quando a receita não entra, para não deixar um buraco no sítio dela.
           */}
          <div
            className={`grid grid-cols-2 gap-3.5 ${canManage ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
          >
            <StatCard
              label="Vendidos"
              value={formatNumber(stats.vendidos)}
              sub={
                event.ticketCapacity != null ? `/${formatNumber(event.ticketCapacity)}` : undefined
              }
            />
            {canManage ? (
              <StatCard label="Receita bilhetes" value={formatEuro(stats.receitaCents)} />
            ) : null}
            <StatCard
              label="Já entraram"
              value={formatNumber(stats.entraram)}
              valueClassName="text-success"
            />
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
  );
}
