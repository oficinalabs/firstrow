"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Watermark } from "@/components/player/watermark";
import { Button, buttonVariants } from "@/components/ui/button";
import { LiveBadge } from "@/components/ui/live-badge";
import { Skeleton } from "@/components/ui/skeleton";

type State =
  | { kind: "loading" }
  | { kind: "playing"; iframeUrl: string; sessionId: string }
  | { kind: "error"; message: string }
  | { kind: "revoked" };

const HEARTBEAT_MS = 20_000;

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

  // Heartbeat: se a sessão for revogada (a conta abriu noutro sítio), corta aqui.
  useEffect(() => {
    if (state.kind !== "playing") return;
    const sessionId = state.sessionId;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/playback/${eventId}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await res.json().catch(() => ({ active: false }))) as { active: boolean };
      if (!data.active) setState({ kind: "revoked" });
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [state, eventId]);

  if (state.kind === "revoked") return <RevokedFrame onResume={start} />;

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
      <Watermark label={watermark} />
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

function RevokedFrame({ onResume }: { onResume: () => void }) {
  return (
    <div className="overflow-hidden rounded-sm border bg-card">
      <div className="flex aspect-video items-center justify-center gap-2 bg-bar">
        <MonitorIcon />
        <PhoneIcon />
      </div>
      <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
        <h2 className="max-w-75 font-display text-lg font-extrabold leading-tight">
          A tua conta começou a ver noutro dispositivo
        </h2>
        <p className="max-w-75 text-2sm leading-relaxed text-muted-foreground">
          Só uma sessão pode ver de cada vez. Se foste tu, retoma aqui; se não reconheces isto, muda
          já a password.
        </p>
        <div className="mt-1.5 flex w-full flex-col gap-2.5">
          <Button size="lg" onClick={onResume}>
            Retomar aqui
          </Button>
          <Link href="/recuperar" className={buttonVariants({ variant: "ghost" })}>
            Mudar a password
          </Link>
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
