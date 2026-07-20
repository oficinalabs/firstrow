"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Watermark } from "@/components/player/watermark";
import { Button, buttonVariants } from "@/components/ui/button";
import { LiveBadge } from "@/components/ui/live-badge";
import { Skeleton } from "@/components/ui/skeleton";

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
}: {
  eventId: string;
  watermark: string;
  mode?: "live" | "vod";
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const startingRef = useRef(false);

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

  if (state.kind === "stopped") return <StoppedFrame reason={state.reason} onResume={start} />;

  if (state.kind === "error") {
    return (
      <Frame>
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
      <Frame>
        <Skeleton className="absolute inset-0 rounded-none" />
      </Frame>
    );
  }

  return (
    <Frame>
      <iframe
        title="Transmissão"
        src={state.iframeUrl}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
        className="absolute inset-0 size-full border-0"
      />
      {mode === "live" && <LiveBadge className="absolute left-4 top-4 z-10" />}
      <Watermark label={watermark} onTampered={onTampered} />
    </Frame>
  );
}

// Moldura 16:9 do player — vive sempre em dark (o vídeo pede-o).
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-black">
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
