"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FullscreenButton } from "@/components/player/fullscreen-button";
import { Watermark } from "@/components/player/watermark";
import { Button, buttonVariants } from "@/components/ui/button";
import { LiveBadge } from "@/components/ui/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  O PLAYER — e as três coisas que ele passou a fazer bem
 * ============================================================================
 *
 * 1. NÃO RECARREGA A MEIO. O token de reprodução passou a cobrir a sessão
 *    inteira (ver `lib/cloudflare.ts`), por isso este componente pede UM token
 *    e fica quieto. Não há renovação porque não pode haver: renovar obriga a
 *    trocar o `src` do iframe, e trocar o `src` reinicia o vídeo.
 *
 * 2. SABE PORQUE PAROU. O heartbeat devolve um motivo, e cada motivo tem o seu
 *    ecrã. Mostrar "a tua conta abriu noutro dispositivo" a quem só abriu um
 *    segundo separador é ensinar a pessoa a ignorar o aviso que interessa.
 *
 * 3. VIGIA A MARCA DE ÁGUA. Se ela sair do ecrã, o iframe é desmontado (o
 *    vídeo pára mesmo, não fica em pausa por baixo) e a sessão é revogada no
 *    servidor. Ver a nota de honestidade em `components/player/watermark.tsx`
 *    sobre o que esta defesa apanha e o que nunca vai apanhar.
 */

type Stop = "revoked" | "superseded" | "no-access" | "tampered";

type State =
  | { kind: "loading" }
  | { kind: "playing"; iframeUrl: string; sessionId: string }
  | { kind: "error"; message: string }
  | { kind: "stopped"; reason: Stop };

const HEARTBEAT_MS = 20_000;

type HeartbeatBody = { active: boolean; reason?: Stop };

export function WatchPlayer({
  eventId,
  watermark,
  mode = "live",
  alvoEcraInteiro,
  preencher = false,
}: {
  eventId: string;
  watermark: string;
  mode?: "live" | "vod";
  /**
   * Quem vai a ecrã inteiro, se não for a moldura.
   *
   * O ecrã inteiro continua a ser pedido a um elemento que CONTÉM o iframe e a
   * marca — a defesa não mudou. O que mudou foi poder ser um elemento de fora
   * que contenha a moldura *e* mais alguma coisa: hoje o palco, que leva
   * também o chat sobreposto (`components/chat/palco-com-chat.tsx`). Sem isto,
   * o chat ficava fora do que o sistema desenha e não aparecia em ecrã inteiro.
   *
   * Por omissão é a moldura, como sempre. E a regra é verificada em tempo de
   * execução, não por confiança: se o alvo deixar a marca de fora, o vigia
   * responde `sem-a-marca` e a reprodução pára.
   */
  alvoEcraInteiro?: React.RefObject<HTMLElement | null>;
  /**
   * A moldura preenche o pai em vez de impor os seus 16:9.
   *
   * É o que o ecrã inteiro precisa: antes, a moldura ERA o elemento em ecrã
   * inteiro e o browser dava-lhe 100%×100% por si; agora quem lá está é o
   * palco, e sem isto a moldura ficava com 56,25% da altura do ecrã e o resto
   * a preto. O vídeo continua a ser enquadrado pelo player da Cloudflare, cá
   * dentro, exatamente como antes.
   */
  preencher?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const startingRef = useRef(false);
  // A moldura: leva o iframe e a marca. Vai a ecrã inteiro se ninguém indicar
  // outro alvo — e o alvo que indicarem tem de a conter.
  const frameRef = useRef<HTMLDivElement>(null);
  const alvo = alvoEcraInteiro ?? frameRef;

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setState({ kind: "loading" });

    try {
      const res = await fetch(`/api/playback/${eventId}/session`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setState({
          kind: "error",
          message: body.error ?? "Não foi possível iniciar a reprodução.",
        });
        return;
      }
      const data = (await res.json()) as { sessionId: string; iframeUrl: string };
      setState({ kind: "playing", iframeUrl: data.iframeUrl, sessionId: data.sessionId });
    } catch {
      setState({ kind: "error", message: "Falha de ligação ao iniciar a reprodução." });
    } finally {
      startingRef.current = false;
    }
  }, [eventId]);

  useEffect(() => {
    start();
  }, [start]);

  // Heartbeat: se a sessão for cortada (outro dispositivo, outro separador, ou
  // o direito acabou), o player descobre aqui e pára com o ecrã certo.
  useEffect(() => {
    if (state.kind !== "playing") return;
    const sessionId = state.sessionId;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/playback/${eventId}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await res.json().catch(() => ({ active: false }))) as HeartbeatBody;
      if (!data.active) setState({ kind: "stopped", reason: data.reason ?? "revoked" });
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [state, eventId]);

  /*
   * A marca de água saiu do ecrã. A ordem importa: primeiro tirar o vídeo (o
   * `setState` desmonta o iframe e a reprodução pára já), só depois avisar o
   * servidor. Se o aviso falhar — sem rede, pedido bloqueado — o vídeo ficou
   * parado à mesma neste browser.
   */
  const onTampered = useCallback(
    (motivo: string) => {
      const sessionId = state.kind === "playing" ? state.sessionId : null;
      setState({ kind: "stopped", reason: "tampered" });
      if (!sessionId) return;
      void fetch(`/api/playback/${eventId}/marca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, detail: motivo }),
        keepalive: true,
      }).catch(() => {});
    },
    [eventId, state],
  );

  /*
   * Parou? Então sair do ecrã inteiro.
   *
   * Antes isto acontecia por acidente e funcionava: o elemento em ecrã inteiro
   * era a MOLDURA, e a moldura desaparece do DOM quando o player passa a
   * `stopped` — o browser sai sozinho. Com o palco como alvo (que sobrevive à
   * paragem), o aviso ficava esticado a um ecrã inteiro de largura e o chat
   * sobreposto continuava aberto sobre um vídeo que já não existe. O aviso é
   * para ser lido; lê-se na página.
   */
  const parado = state.kind === "stopped";
  useEffect(() => {
    if (parado && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [parado]);

  if (state.kind === "stopped") return <StoppedFrame reason={state.reason} onResume={start} />;

  if (state.kind === "error") {
    return (
      <Frame preencher={preencher}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-80 text-2sm text-muted-foreground">{state.message}</p>
          <Button variant="secondary" onClick={start}>
            Tentar outra vez
          </Button>
        </div>
      </Frame>
    );
  }

  if (state.kind === "loading") {
    return (
      <Frame preencher={preencher}>
        <Skeleton className="absolute inset-0 rounded-none" />
      </Frame>
    );
  }

  return (
    <Frame ref={frameRef} preencher={preencher}>
      <iframe
        title="Transmissão"
        /*
         * SEM `allowFullScreen`, E ISSO É A DEFESA — não um esquecimento.
         *
         * Com ele, o elemento que ia a ecrã inteiro era o IFRAME, e o sistema
         * desenha só o iframe: a marca de água, que vive cá fora, desaparecia
         * do ecrã sem ninguém lhe tocar. O ecrã inteiro passou a ser pedido à
         * MOLDURA por um botão nosso (ver `fullscreen-button.tsx`), e a marca
         * vai lá dentro.
         *
         * Efeito lateral medido, e é o melhor desta abordagem: o player da
         * Cloudflare **esconde sozinho** o botão de ecrã inteiro dele quando a
         * política não lho permite. Não fica um botão morto na barra.
         *
         * `picture-in-picture 'none'` é o mesmo buraco por outra porta: em PiP
         * o vídeo salta para uma janela do sistema, fora do nosso DOM, e a
         * marca também não vai.
         *
         * Tem de ser NEGADO por escrito. Ao contrário do ecrã inteiro — cuja
         * lista por omissão é `self`, e por isso basta calar —, o PiP vem
         * permitido a todos por omissão. Mediu-se: **omitir não chega**, o
         * vídeo entra em PiP na mesma; só `'none'` o fecha.
         *
         * O que foi medido, motor a motor, porque não é igual nos dois:
         *   Chromium — `pictureInPictureEnabled` fica `false`, o pedido é
         *              recusado (SecurityError) e a Cloudflare deixa de
         *              desenhar o botão de PiP na barra (visto em captura).
         *   WebKit   — `pictureInPictureEnabled` continua a dizer `true` (o
         *              WebKit não liga essa bandeira à política), mas o pedido
         *              é recusado na mesma (NotAllowedError).
         *
         * NÃO VERIFICADO: o Safari a sério tem uma API própria
         * (`webkitSetPresentationMode`) que a Permissions Policy não governa.
         * No WebKit do Playwright ela não chegou a entrar em PiP, mas essa
         * build pode simplesmente não ter PiP — não serve de prova sobre o
         * Safari de verdade. Quem lá for a seguir, meça num Mac com Safari.
         */
        src={state.iframeUrl}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture 'none';"
        className="absolute inset-0 size-full border-0"
      />
      {mode === "live" && <LiveBadge className="absolute left-4 top-4 z-10" />}
      <Watermark label={watermark} onTampered={onTampered} />
      <FullscreenButton alvo={alvo} />
    </Frame>
  );
}

/*
 * Moldura 16:9 do player — vive sempre em dark (o vídeo pede-o).
 *
 * O iframe e a marca são ambos filhos dela, e é isso que a torna um alvo
 * legítimo para o ecrã inteiro: o sistema desenha-os aos dois. Quando o alvo é
 * o palco (vídeo + chat), a moldura deixa de ser o elemento em ecrã inteiro e
 * passa a ser um filho dele — daí o `preencher`, que troca os 16:9 por "ocupa
 * o pai". Nos dois casos é o player da Cloudflare, lá dentro, que trata das
 * barras pretas do vídeo — como faria de qualquer maneira.
 *
 * Sem variante `fullscreen:` do Tailwind para arredondar os cantos a zero: essa
 * variante não existe nesta versão (procurou-se), e uma classe que não existe
 * compila para nada sem avisar. Em ecrã inteiro os 6px de canto ficam pretos
 * sobre preto, o que não se vê — não vale um seletor à mão.
 *
 * ⚠️ NADA de `transform`, `filter`, `opacity` ou `isolate` aqui. Qualquer um
 * deles cria contexto de empilhamento e prende a marca de água dentro da
 * moldura — deixaria de poder ficar à frente do chat sobreposto, que é o que
 * impede o vigia de cortar o vídeo. Ver `Z_MARCA` em `watermark.tsx`.
 */
function Frame({
  children,
  ref,
  preencher = false,
}: {
  children: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
  preencher?: boolean;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-sm bg-black",
        preencher ? "size-full" : "aspect-video w-full",
      )}
    >
      {children}
    </div>
  );
}

/*
 * Cada paragem tem o seu texto. O caso `superseded` é o que existia a mentir:
 * era o mesmo browser a recarregar e o ecrã dizia "outro dispositivo" — um
 * alarme falso, repetido de dois em dois minutos, que treinava a pessoa a não
 * ler o alarme verdadeiro.
 */
const STOPS: Record<Stop, { title: string; body: string; resume: string }> = {
  revoked: {
    title: "A tua conta começou a ver noutro dispositivo",
    body: "Só uma reprodução de cada vez. Se foste tu, retoma aqui; se não reconheces isto, muda já a password.",
    resume: "Retomar aqui",
  },
  superseded: {
    title: "Abriste este evento noutro separador",
    body: "A reprodução foi para lá. Podes trazê-la de volta para este separador quando quiseres.",
    resume: "Ver aqui",
  },
  "no-access": {
    title: "O teu acesso a este evento terminou",
    body: "Isto acontece se a compra foi reembolsada ou anulada. Se achas que é engano, fala com a organização da liga.",
    resume: "Tentar outra vez",
  },
  tampered: {
    title: "Reprodução interrompida",
    body: "A marca de água que identifica esta sessão foi removida ou tapada. A sessão foi terminada e o caso ficou registado na conta.",
    resume: "Recomeçar",
  },
};

function StoppedFrame({ reason, onResume }: { reason: Stop; onResume: () => void }) {
  const texto = STOPS[reason];
  return (
    <div className="overflow-hidden rounded-sm border bg-card">
      <div className="flex aspect-video items-center justify-center gap-2 bg-bar">
        <MonitorIcon />
        <PhoneIcon />
      </div>
      <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
        <h2 className="max-w-75 font-display text-lg font-extrabold leading-tight">
          {texto.title}
        </h2>
        <p className="max-w-75 text-2sm leading-relaxed text-muted-foreground">{texto.body}</p>
        <div className="mt-1.5 flex w-full flex-col gap-2.5">
          <Button size="lg" onClick={onResume}>
            {texto.resume}
          </Button>
          {reason === "revoked" && (
            <Link href="/recuperar" className={buttonVariants({ variant: "ghost" })}>
              Mudar a password
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function MonitorIcon() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-muted-foreground"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <rect x="8.5" y="19" width="7" height="2" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      className="text-accent"
      aria-hidden="true"
    >
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
    </svg>
  );
}
