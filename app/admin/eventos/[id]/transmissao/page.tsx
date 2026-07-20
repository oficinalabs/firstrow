import type { Metadata } from "next";
import { CopyField } from "@/components/admin/copy-field";
import { DataTable } from "@/components/admin/data-table";
import { EventStatusActions } from "@/components/admin/event-status-actions";
import { EventStatusBadge } from "@/components/admin/event-status-badge";
import { LiveViewers } from "@/components/admin/live-viewers";
import { PageHeader } from "@/components/admin/page-header";
import { ProvisionStreamButton } from "@/components/admin/provision-stream-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEuro, formatNumber, formatTime } from "@/lib/format";
import { canManageEvents, operateScope } from "@/server/authz";
import { channelsInScope } from "@/server/channels";
import { getStreamAccountStatus, getStreamCredentials } from "@/server/cloudflare-stream";
import { requireEventOperator } from "@/server/event-access";
import { linkEventRecording } from "@/server/recordings";
import {
  type BlockedSession,
  countActiveViewers,
  getEventSales,
  listBlockedSessionsToday,
} from "@/server/stats";

// Nunca em cache: a chave da stream vive nesta página e é por pedido, para
// quem tem papel para a ver. Uma versão guardada era uma versão partilhada.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transmissão" };

const STATUS_HELP: Record<string, string> = {
  draft: "Liga o OBS com as credenciais acima e começa quando estiveres pronto.",
  live: "Está no ar — quem comprou acesso consegue ver.",
  ended: "Transmissão terminada. Podes voltar a rascunho se foi engano.",
};

export default async function TransmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Antes de ir buscar seja o que for: a chave da stream é a chave de casa da
  // transmissão e só sai daqui para quem opera o evento — deste canal. O
  // portão devolve o evento já carregado, por isso não há segunda query.
  const { user, event } = await requireEventOperator(id, `/admin/eventos/${id}/transmissao`);

  /*
   * Segunda (e seguintes) tentativas de ligar a gravação. Ao terminar quase
   * sempre é cedo demais — a Cloudflare ainda está a processar. Quem abre esta
   * página de um evento terminado sem gravação resolve-o sem saber que o fez.
   */
  if (event.status === "ended" && !event.cfVodUid) {
    await linkEventRecording(id).catch(() => {
      // Diagnóstico, não guarda: a página abre à mesma.
    });
  }

  const [sales, viewers, blocked, credentials, channels, contaStream] = await Promise.all([
    getEventSales(id),
    countActiveViewers(id),
    listBlockedSessionsToday(id),
    event.cfLiveInputId ? getStreamCredentials(event.cfLiveInputId) : Promise.resolve(null),
    channelsInScope(operateScope(user)),
    // Ter chave não é o mesmo que poder transmitir — ver getStreamAccountStatus.
    getStreamAccountStatus(),
  ]);

  /*
   * Que liga vai para o ar. Quem opera duas tem duas régies e dois OBS abertos
   * ao mesmo tempo — e a chave que está aqui em baixo emite para DENTRO deste
   * evento. Enganar-se de separador é pôr uma liga no canal da outra.
   *
   * Com um canal só, isto não aparece: não há engano possível.
   */
  const channel = channels.many ? channels.byId.get(event.channelId) : undefined;

  // Provisionar de novo custa dinheiro na conta da liga: é gerir, não operar.
  // O staff vê a explicação, mas o botão que gasta é só para quem gere o canal.
  const canManage = canManageEvents(user, event.channelId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title={event.title}
        badge={<EventStatusBadge status={event.status} />}
        meta={channel?.name}
        backHref="/admin/eventos"
        backLabel="Eventos"
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3.5">
          {/* A contagem de bloqueadas hoje é a do StatCard aqui em cima — a
              tabela em baixo é o detalhe, não uma segunda contagem. */}
          <LiveViewers
            eventId={event.id}
            initial={{ viewers, blockedToday: blocked.total }}
            isLive={event.status === "live"}
          />

          <Card>
            <CardHeader>
              <CardTitle>Contas com sessão cortada</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable<BlockedSession>
                columns={[
                  {
                    header: "Conta",
                    cell: (s) => <span className="font-mono text-xs">{s.email}</span>,
                  },
                  { header: "Hora", numeric: true, cell: (s) => formatTime(s.revokedAt) },
                ]}
                rows={blocked.rows}
                rowKey={(s) => s.id}
                empty={
                  <p className="py-4 text-2sm text-muted-foreground">
                    Nenhuma sessão cortada hoje.
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
                  {/*
                   * O aviso vem ANTES das credenciais de propósito: com a conta
                   * sem subscrição, a chave abaixo tem bom aspeto e é recusada
                   * na mesma. Sem isto, perde-se a noite a culpar o OBS.
                   */}
                  {contaStream && !contaStream.podeTransmitir ? (
                    <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-2sm leading-relaxed text-foreground">
                      <strong className="font-semibold">
                        A conta Cloudflare não tem o Stream ativo.
                      </strong>{" "}
                      As credenciais abaixo estão certas, mas a transmissão vai ser recusada — o OBS
                      fica em "a tentar reconectar" sem dizer porquê. O Cloudflare Stream é pago e
                      não tem plano gratuito: ativa a subscrição no painel da Cloudflare e estas
                      mesmas credenciais passam a funcionar, sem recriar nada.
                    </p>
                  ) : null}
                  <CopyField label="Servidor RTMPS" value={credentials.rtmpsUrl} />
                  <CopyField label="Chave da stream" value={credentials.streamKey} masked />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    A chave é deste evento. Nunca a mostres em stream nem a partilhes fora da régie.
                  </p>
                  {contaStream?.podeTransmitir ? (
                    /*
                     * Com subscrição, o risco deixa de ser "não transmite" e passa
                     * a ser "acaba o plano a meio da época" — o armazenamento
                     * acumula evento a evento e ninguém vai ao painel ver.
                     */
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Armazenamento Cloudflare: {Math.round(contaStream.minutosUsados)} de{" "}
                      {contaStream.minutosLimite} minutos.
                    </p>
                  ) : null}
                </>
              ) : event.cfLiveInputId ? (
                /*
                 * A stream existe, mas não a conseguimos ler agora. É temporário
                 * (a Cloudflare ou a nossa ligação a ela), por isso a saída é
                 * recarregar — não mexer em nada.
                 */
                <p className="text-2sm leading-relaxed text-muted-foreground">
                  Não deu para ir buscar as credenciais à Cloudflare agora. É do lado do serviço de
                  streaming, não do teu evento — espera um momento e recarrega a página.
                </p>
              ) : (
                /*
                 * O evento nasceu sem stream: a Cloudflare não respondeu quando
                 * ele foi criado. Antes, a única saída era apagar e criar outro —
                 * mas apagar recusa se já houve vendas, e aí o evento ficava
                 * morto. Agora pede-se a stream outra vez, sem apagar nada.
                 */
                <div className="flex flex-col gap-3">
                  <p className="text-2sm leading-relaxed text-muted-foreground">
                    Este evento ficou sem stream — o serviço de streaming (Cloudflare) não respondeu
                    quando ele foi criado. Nada do que vendeste se perdeu.
                    {canManage
                      ? " Pede a stream outra vez aqui em baixo."
                      : " Quem gere o canal pode voltar a pedi-la."}
                  </p>
                  {canManage ? <ProvisionStreamButton eventId={event.id} /> : null}
                </div>
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
