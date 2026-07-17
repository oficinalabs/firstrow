"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type ScanOutcome, ScanResult } from "@/components/tickets/scan-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/format";

type DetectedBarcode = { rawValue: string };

declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
  }
}

type CameraState = "starting" | "on" | "unavailable";

/*
 * Scanner de porta: câmara via BarcodeDetector quando o browser deixa, input
 * manual SEMPRE visível em baixo (a câmara falha; a fila não pode falhar).
 * Vive em dark permanente — é para usar de noite.
 */
export function Scanner({
  eventoId,
  eventoTitulo,
  vendidos,
  entraram: entraramInicial,
}: {
  eventoId: string;
  eventoTitulo: string;
  vendidos: number;
  entraram: number;
}) {
  const [entraram, setEntraram] = useState(entraramInicial);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [validating, setValidating] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [camera, setCamera] = useState<CameraState>("starting");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const lastReadRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  // O loop da câmara lê estes valores sem reiniciar o efeito.
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;

  const validate = useCallback(
    async (code: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setValidating(true);
      try {
        const res = await fetch("/api/tickets/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, eventId: eventoId }),
        });
        if (!res.ok) {
          setOutcome({ resultado: "invalido" });
          return;
        }
        const result = (await res.json()) as ScanOutcome;
        setOutcome(result);
        if (result.resultado === "valido") setEntraram((n) => n + 1);
      } catch {
        setOutcome({ resultado: "invalido" });
      } finally {
        busyRef.current = false;
        setValidating(false);
      }
    },
    [eventoId],
  );

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    async function start() {
      if (!video || !window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
        setCamera("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        setCamera("on");

        timerRef.current = setInterval(async () => {
          if (busyRef.current || outcomeRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue?.trim();
            if (!raw) return;
            // Evita revalidar o mesmo QR parado à frente da câmara.
            const now = Date.now();
            if (raw === lastReadRef.current.code && now - lastReadRef.current.at < 4000) return;
            lastReadRef.current = { code: raw, at: now };
            void validate(raw);
          } catch {
            // frame sem leitura — segue
          }
        }, 400);
      } catch {
        if (!cancelled) setCamera("unavailable");
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) for (const track of streamRef.current.getTracks()) track.stop();
    };
  }, [validate]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setManualCode("");
    void validate(code);
  }

  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-bar text-bar-foreground">
      <header className="flex shrink-0 items-center justify-between px-4 py-3.5">
        <div>
          <p className="text-sm font-bold">{eventoTitulo}</p>
          <p className="font-mono text-2xs text-bar-muted">porta principal</p>
        </div>
        <p className="font-mono text-sm font-semibold text-accent">
          {formatNumber(entraram)}
          <span className="text-bar-muted">/{formatNumber(vendidos)}</span>
        </p>
      </header>

      <div className="relative h-70 shrink-0 overflow-hidden bg-bar-active">
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute top-6 left-11 size-9 border-t-4 border-l-4 border-bar-foreground" />
          <div className="absolute top-6 right-11 size-9 border-t-4 border-r-4 border-bar-foreground" />
          <div className="absolute bottom-6 left-11 size-9 border-b-4 border-l-4 border-bar-foreground" />
          <div className="absolute right-11 bottom-6 size-9 border-b-4 border-r-4 border-bar-foreground" />
        </div>
        {camera !== "on" ? (
          <p className="absolute inset-0 flex items-center justify-center font-mono text-xs text-bar-muted">
            {camera === "starting" ? "a ligar a câmara…" : "câmara indisponível — usa o código"}
          </p>
        ) : null}
      </div>

      {outcome ? (
        <ScanResult outcome={outcome} onNext={() => setOutcome(null)} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-mono text-sm text-bar-muted">
            {validating ? "a validar…" : "aponta a câmara ao QR do bilhete"}
          </p>
        </div>
      )}

      <form
        onSubmit={submitManual}
        className="flex shrink-0 gap-2.5 border-t border-bar-border p-4"
      >
        <Input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Escrever código à mão (FR-XXXX-XX)"
          aria-label="Código do bilhete"
          autoCapitalize="characters"
          autoCorrect="off"
          enterKeyHint="go"
          className="font-mono"
        />
        <Button type="submit" disabled={validating || manualCode.trim().length < 4}>
          Validar
        </Button>
      </form>
    </div>
  );
}
