import type { Metadata } from "next";
import { updateEventAction } from "@/app/admin/eventos/actions";
import { EventDetailTabs } from "@/components/admin/event-detail-tabs";
import { EventForm } from "@/components/admin/event-form";
import { EventStatusBadge } from "@/components/admin/event-status-badge";
import { PageHeader } from "@/components/admin/page-header";
import { eventEditRules, eventToDraft, eventToFormValues } from "@/lib/event-rules";
import { manageScope } from "@/server/authz";
import { channelsInScope } from "@/server/channels";
import { requireEventManager } from "@/server/event-access";
import { readCommitments } from "@/server/events";

export const metadata: Metadata = { title: "Editar evento" };

// A chave da stream não vive aqui, mas o preço e as vendas sim — nunca em cache.
export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /*
   * Editar é GERIR (mexe no dinheiro e na configuração do evento), por isso o
   * gate é `requireEventManager` — owner do canal do evento, não staff. Um
   * evento de outro canal dá a mesma resposta que um id inventado (404), pela
   * regra da casa em `server/event-access.ts`. O portão devolve o evento já
   * carregado.
   */
  const { user, event } = await requireEventManager(id, `/admin/eventos/${id}/editar`);

  const [commitments, channels] = await Promise.all([
    readCommitments(id, event.status),
    channelsInScope(manageScope(user)),
  ]);

  // Que liga é esta — mostra-se como contexto quando há mais do que uma. O canal
  // de um evento não se edita (ver lib/event-rules.ts), por isso é só isso.
  const channel = channels.many ? (channels.byId.get(event.channelId) ?? null) : null;
  const current = eventToDraft(event);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {/* O título é o do EVENTO, não "Editar evento": a página faz parte do
          detalhe do evento, e é a aba ativa "Editar" que diz o que se está a
          fazer — não um segundo título a repeti-lo. */}
      <PageHeader
        title={event.title}
        badge={<EventStatusBadge status={event.status} />}
        meta={channel?.name}
        backHref="/admin/eventos"
        backLabel="Eventos"
      />

      {/* Esta rota é `requireEventManager` (só o dono), logo `canManage` é
          sempre verdadeiro aqui — a aba de editar existe de certeza. */}
      <EventDetailTabs
        eventId={event.id}
        active="editar"
        canManage
        hasTickets={event.ticketPriceCents != null}
      />

      <EventForm
        mode="edit"
        // O id viaja LIGADO no servidor, não no formulário: é o que impede
        // gravar as alterações de um ecrã por cima de outro evento.
        action={updateEventAction.bind(null, id)}
        channel={channel}
        editing={{
          current,
          values: eventToFormValues(current),
          rules: eventEditRules(commitments),
          // `readCommitments` já devolve o status normalizado — é o mesmo objeto.
          commitments,
        }}
      />
    </div>
  );
}
