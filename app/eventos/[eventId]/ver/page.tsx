import { redirect } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { EventCard } from "@/components/eventos/event-card";
import { LikeShare } from "@/components/eventos/like-share";
import { splitProgram } from "@/components/eventos/program";
import { WatchPlayer } from "@/components/player/watch-player";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getChannelById } from "@/server/channels";
import { chatSnapshot, getLikes, openChat, VOD_AVAILABILITY_DAYS } from "@/server/chat";
import { listEventsByChannel } from "@/server/events";

export const dynamic = "force-dynamic";

/*
 * ============================================================================
 *  A PÁGINA DE VER — o player, a conversa, o gosto e a partilha
 * ============================================================================
 *
 * ⚠️ O PORTÃO É UM SÓ, E É `openChat`.
 *
 * Antes esta página resolvia o utilizador e o evento por si e chamava
 * `canWatchEvent` à mão. Fazia o mesmo que a conversa faz — o que quer dizer
 * que eram duas leituras da mesma regra, lado a lado, à espera de divergirem.
 * Agora a página usa o MESMO portão que `/api/chat` usa; `openChat` devolve o
 * utilizador, o evento, a fase da conversa e se esta pessoa modera. Se um dia a
 * regra mudar, muda para os dois ao mesmo tempo porque só existe uma.
 *
 * PORQUE É QUE O CHAT PODE VIR RENDERIZADO DO SERVIDOR
 * Porque esta página inteira só existe para quem passa o portão: o `redirect()`
 * lança e nada abaixo dele corre. Quem não comprou não recebe HTML nem payload
 * RSC com mensagens nenhumas — não é que estejam escondidas por CSS, é que não
 * chegam a ser lidas da base de dados. (Medido: ver o relatório da frente.)
 */

const AVISO_FECHADO = {
  draft: "O chat abre quando a transmissão começar.",
  expirado: `Os comentários fecharam — o arquivo deste evento expirou (${VOD_AVAILABILITY_DAYS} dias).`,
} as const;

export default async function WatchPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const access = await openChat(eventId);
  // Sem sessão, evento inexistente ou sem acesso: a página pública do evento —
  // que é onde se compra, e que responde 404 se o evento não existir. A mesma
  // resposta para os três casos não conta a ninguém qual deles foi.
  if (!access.ok) redirect(`/eventos/${eventId}`);

  const { user, event, phase } = access;
  const isVod = event.status === "ended" && Boolean(event.cfVodUid);

  const [channel, archive, chat, likes] = await Promise.all([
    getChannelById(event.channelId),
    // A barra ao lado chama-se "Arquivo do canal" e tem de o ser mesmo: vinha
    // de `listEvents()` e misturava os replays de todos os canais.
    isVod
      ? listEventsByChannel(event.channelId).then((rows) =>
          splitProgram(rows).archive.filter((e) => e.id !== eventId),
        )
      : Promise.resolve([]),
    chatSnapshot(access),
    getLikes(eventId, user.id),
  ]);

  const canal = channel ? ` · ${channel.name}` : "";
  const meta = isVod
    ? `Gravado a ${formatDateTime(event.startsAt)}${canal}`
    : `${formatDateTime(event.startsAt)} · Em direto${canal}`;

  const conversa = (
    <ChatPanel
      eventId={eventId}
      viewerId={user.id}
      initial={chat}
      closedNotice={event.status === "draft" ? AVISO_FECHADO.draft : AVISO_FECHADO.expirado}
      // Na live a conversa acompanha a altura da coluna; no arquivo cresce com
      // o conteúdo até ao limite que o próprio painel impõe.
      className={phase === "live" ? "lg:h-full" : undefined}
    />
  );

  const info = (
    <div className="border-b pb-4">
      <h1 className="font-display text-xl font-extrabold tracking-display md:text-2xl">
        {event.title}
      </h1>
      <p className="mt-1.5 text-2sm text-muted-foreground">{meta}</p>
      {/*
       * A descrição, como a liga a escreveu — o mesmo texto da página pública,
       * agora também aqui, ao lado do vídeo.
       *
       * `{event.description}` é um filho de TEXTO: o React escapa-o, por isso um
       * `<script>` escrito no backoffice sai como as nove letras que são. NÃO há
       * `dangerouslySetInnerHTML` — e a tentação de o pôr, para converter `\n` em
       * `<br>`, resolve-se com `whitespace-pre-line`, que desenha as quebras sem
       * marcação nenhuma pelo meio. É o mesmo padrão de
       * `app/eventos/[eventId]/page.tsx`; há um teste que lê estes ficheiros e
       * fica vermelho se alguém acrescentar o atalho.
       *
       * Fica ENTRE o meta e o `LikeShare`, e não depois: quem chega aqui já
       * comprou e quer saber o que está a ver — o gosto e a partilha são o passo
       * seguinte, não o primeiro.
       */}
      {event.description ? (
        <p className="mt-2.5 text-2sm leading-relaxed whitespace-pre-line text-muted-foreground">
          {event.description}
        </p>
      ) : null}
      <LikeShare
        className="mt-3"
        eventId={eventId}
        initial={likes}
        signedIn
        // SEMPRE a página pública. Partilhar a de ver mandava quem recebesse o
        // link para um sítio de onde é imediatamente reencaminhado.
        shareUrl={`${env.NEXT_PUBLIC_APP_URL}/eventos/${eventId}`}
        shareTitle={event.title}
        shareText={channel ? `${event.title} — ${channel.name}` : event.title}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Sessão pessoal — uma reprodução em simultâneo por conta. Se abrires noutro dispositivo, esta
        pára.
      </p>
    </div>
  );

  /*
   * A LIVE põe a conversa ao lado do player (é o que se espera de um direto, e
   * é onde ela é olhada ao mesmo tempo que o vídeo). O ARQUIVO põe os
   * comentários por baixo e deixa a coluna para o arquivo do canal — os
   * comentários de um VOD lêem-se depois de ver, não ao lado.
   *
   * No telemóvel — o caso principal — os dois casos caem na mesma coluna única,
   * com o player primeiro e a conversa a seguir.
   */
  const colunaLateral = phase === "live" ? conversa : null;
  const asideArquivo =
    !colunaLateral && archive.length > 0 ? (
      <aside aria-label="Arquivo do canal">
        <h2 className="mb-2.5 font-display text-base font-bold">Arquivo do canal</h2>
        <div className="flex flex-col">
          <EventCard event={event} layout="row" active />
          {archive.map((e) => (
            <EventCard key={e.id} event={e} layout="row" />
          ))}
        </div>
      </aside>
    ) : null;

  const comDuasColunas = Boolean(colunaLateral || asideArquivo);

  return (
    <ViewerShell channel={channel ?? undefined}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 md:py-6">
        <div
          className={
            comDuasColunas ? "grid items-start gap-6 lg:grid-cols-[1fr_340px]" : "mx-auto max-w-4xl"
          }
        >
          <div className="min-w-0">
            <WatchPlayer eventId={eventId} watermark={user.email} mode={isVod ? "vod" : "live"} />
            <div className="mt-4">{info}</div>
            {phase !== "live" ? <div className="mt-4">{conversa}</div> : null}
          </div>
          {colunaLateral ?? asideArquivo}
        </div>
      </div>
    </ViewerShell>
  );
}
