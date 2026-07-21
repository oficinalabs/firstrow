import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { EventStatusBadge } from "@/components/admin/event-status-badge";
import { EventTitleLink } from "@/components/admin/event-title-link";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AGENDA_PATH, SCANNER_PATH } from "@/lib/backoffice-zones";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import { operateScope, requireBackofficePage } from "@/server/authz";
import { type ChannelsInScope, channelsInScope } from "@/server/channels";
import { type EventForOperations, listEventsForOperations } from "@/server/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Agenda" };

/*
 * ============================================================================
 *  A AGENDA — o que há para operar, sem um número de dinheiro
 * ============================================================================
 *
 * PARA QUEM: a equipa da liga (`staff`), que opera a régie e valida bilhetes à
 * porta. Até aqui só tinha o scanner, e o scanner é servido sem moldura (usa-se
 * de pé, com uma mão) — logo sem barra lateral. Quem entrasse no backoffice
 * ficava num beco: a transmissão e os bilhetes de cada evento só se alcançavam
 * por um link que alguém lhe mandasse. Esta página é o índice que faltava.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE É UMA ROTA NOVA, E NÃO `/admin/eventos` COM COLUNAS FILTRADAS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Porque esconder a coluna não esconde o dado. No App Router, o que a página
 * FOI BUSCAR viaja no payload do RSC mesmo que o componente que o mostrava não
 * chegue a ser desenhado — está medido no `proxy.ts` e é a razão pela qual o
 * gate de `/admin/ganhos` é uma condição ANTES do `await` e não um `{cond &&}`
 * no JSX. Uma `/admin/eventos` que baixasse o gate para `operate` e escondesse
 * as colunas de PPV, compradores e receita punha esses números no corpo da
 * resposta enviada ao staff. Foi exactamente essa a fuga que a Frente T fechou
 * na página de transmissão.
 *
 * Não buscar é a única forma de não revelar. Para não buscar é preciso outra
 * query (`listEventsForOperations`, que escolhe as colunas à mão) — e tendo
 * outra query, é outra página, com o seu gate e a sua linha na matriz.
 *
 * O que fica de fora, dito por extenso: preço PPV, preço de bilhete,
 * compradores, bilhetes vendidos, receita, lotação e nomes ou emails de quem
 * comprou. Fica o que serve para operar: o quê, quando, em que estado, e para
 * onde ir.
 */

/** "hoje 21:30" ou "24/07 21:30" — a mesma frase da lista de gestão. */
function eventWhen(startsAt: Date): string {
  const day = formatDate(startsAt);
  return `${day === formatDate(new Date()) ? "hoje" : day} ${formatTime(startsAt)}`;
}

function AgendaTable({
  rows,
  channels,
}: {
  rows: EventForOperations[];
  channels: ChannelsInScope;
}) {
  return (
    <DataTable<EventForOperations>
      columns={[
        { header: "Estado", cell: (e) => <EventStatusBadge status={e.status} /> },
        {
          header: "Evento",
          // Em cartão é o assunto da linha: sem ele sobrava um estado e uma
          // data sem dizer de que evento se trata. O nome abre a transmissão,
          // como em todo o backoffice.
          destaque: true,
          cell: (e) => (
            <EventTitleLink
              eventId={e.id}
              title={e.title}
              muted={e.status === "ended"}
              // Devolve à célula o `py-2` que ela já tem: o alvo chega aos 44px
              // sem a linha ficar com o dobro da altura.
              className="-my-2"
            />
          ),
        },
        // De quem é este evento. Só com mais do que um canal em jogo — a mesma
        // regra do resto do backoffice. Quem é staff de duas ligas precisa de
        // distinguir dois "Final da Época" à mesma hora.
        ...(channels.many
          ? [
              {
                header: "Canal",
                cell: (e: EventForOperations) => (
                  <span className="text-xs text-muted-foreground">
                    {channels.byId.get(e.channelId)?.name ?? "—"}
                  </span>
                ),
              },
            ]
          : []),
        {
          header: "Data",
          cell: (e) => (
            <span className="font-mono text-xs text-muted-foreground">{eventWhen(e.startsAt)}</span>
          ),
        },
        {
          header: "",
          numeric: true,
          // Em cartão estes links viram o rodapé, com espaço entre eles — sem
          // isto ficavam encostados à direita a 3px uns dos outros, que é um
          // erro à espera de acontecer num telemóvel numa fila.
          accoes: true,
          cell: (e) => (
            <span className="flex items-center justify-end gap-3.5">
              <Link
                href={`/admin/eventos/${e.id}/transmissao`}
                className="alvo-toque font-sans text-xs font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Transmissão
              </Link>
              {/*
                Bilhetes e scanner só aparecem em eventos que têm bilhete de
                porta. `hasTickets` é um booleano calculado no Postgres — o
                preço nunca sai da base de dados (ver `listEventsForOperations`).
              */}
              {e.hasTickets ? (
                <>
                  <Link
                    href={`/admin/eventos/${e.id}/bilhetes`}
                    className="alvo-toque font-sans text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Bilhetes
                  </Link>
                  <Link
                    href={`${SCANNER_PATH}?evento=${e.id}`}
                    className="alvo-toque font-sans text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Scanner
                  </Link>
                </>
              ) : null}
            </span>
          ),
        },
      ]}
      rows={rows}
      rowKey={(e) => e.id}
    />
  );
}

export default async function AdminAgendaPage() {
  // O gate ANTES de qualquer query, como em todas as páginas do backoffice: no
  // App Router uma página que já começou a ler escreve o que leu no payload,
  // mesmo que acabe por recusar.
  const user = await requireBackofficePage(AGENDA_PATH);
  // `operateScope` e não `manageScope`: quem é staff de uma liga tem de ver os
  // eventos DELA. O gate diz quem abre o ecrã; o âmbito diz de que canais fala.
  const scope = operateScope(user);

  const [events, channels] = await Promise.all([
    listEventsForOperations(scope),
    // O MESMO âmbito: a lista de canais que dá nome às linhas não pode ser mais
    // larga do que a lista de eventos que se mostra.
    channelsInScope(scope),
  ]);

  // O que interessa a quem vai operar é o que ainda está para vir. Um evento no
  // ar ganha sempre a cabeça da lista, esteja a que horas estiver.
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.status === "live" || e.startsAt.getTime() >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = events.filter((e) => e.status !== "live" && e.startsAt.getTime() < now);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Agenda" meta="o que há para operar" />

      {events.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="Nada na agenda"
          description="Quando a liga marcar um evento, ele aparece aqui com os atalhos para a transmissão e para a porta."
        />
      ) : null}

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle>A seguir</CardTitle>
            <span className="font-mono text-2xs text-muted-foreground">
              {formatNumber(upcoming.length)}
            </span>
          </CardHeader>
          <CardContent>
            <AgendaTable rows={upcoming} channels={channels} />
          </CardContent>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle>Já passaram</CardTitle>
            <span className="font-mono text-2xs text-muted-foreground">
              {formatNumber(past.length)}
            </span>
          </CardHeader>
          <CardContent>
            <AgendaTable rows={past} channels={channels} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
