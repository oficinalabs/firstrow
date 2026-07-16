"use client";

import { useEffect, useRef, useState } from "react";
import { Watermark } from "@/components/player/watermark";

type State =
  | { kind: "loading" }
  | { kind: "playing"; iframeUrl: string; sessionId: string }
  | { kind: "error"; message: string }
  | { kind: "revoked" };

export function WatchPlayer({ eventId, watermark }: { eventId: string; watermark: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/playback/${eventId}/session`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!cancelled) setState({ kind: "error", message: body.error ?? "Erro ao iniciar." });
        return;
      }
      const data = (await res.json()) as { sessionId: string; iframeUrl: string };
      if (!cancelled) {
        setState({ kind: "playing", iframeUrl: data.iframeUrl, sessionId: data.sessionId });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

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
    }, 20000);

    return () => clearInterval(interval);
  }, [state, eventId]);

  if (state.kind === "loading") {
    return <div className="aspect-video w-full animate-pulse rounded-xl bg-foreground/10" />;
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-xl border border-foreground/15 p-6 text-sm text-foreground/70">
        {state.message}
      </div>
    );
  }

  if (state.kind === "revoked") {
    return (
      <div className="rounded-xl border border-foreground/15 p-6 text-sm text-foreground/70">
        A tua conta começou a ver noutro sítio. Só é permitida uma sessão em simultâneo.
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        title="Transmissão"
        src={state.iframeUrl}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
      <Watermark label={watermark} />
    </div>
  );
}
