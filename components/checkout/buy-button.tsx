"use client";

import { useRef, useState } from "react";

type Status = "idle" | "submitting" | "pending" | "active" | "error";

export function BuyButton({ eventId, priceLabel }: { eventId: string; priceLabel: string }) {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function pay() {
    setStatus("submitting");
    setMessage("");

    const res = await fetch(`/api/checkout/${eventId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setMessage(body.error ?? "Erro no pagamento.");
      return;
    }

    setStatus("pending");
    setMessage("Confirma o pagamento na app MB WAY (tens 5 minutos).");
    startPolling();
  }

  function startPolling() {
    const started = Date.now();
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/entitlements/${eventId}`);
      const data = (await res.json().catch(() => ({ active: false }))) as { active: boolean };
      if (data.active) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("active");
      } else if (Date.now() - started > 6 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 4000);
  }

  if (status === "active") {
    return (
      <a
        href={`/eventos/${eventId}/ver`}
        className="inline-flex h-11 w-fit items-center rounded-lg bg-foreground px-5 text-sm font-medium text-background"
      >
        Ver em direto
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="tel"
        inputMode="tel"
        placeholder="Telemóvel MB WAY (ex: 912345678)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="h-11 rounded-lg border border-foreground/15 bg-transparent px-4 text-sm"
      />
      <button
        type="button"
        onClick={pay}
        disabled={status === "submitting" || status === "pending" || phone.length < 9}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
      >
        {status === "pending" ? "À espera do MB WAY…" : `Comprar acesso · ${priceLabel}`}
      </button>
      {message && <p className="text-sm text-foreground/60">{message}</p>}
    </div>
  );
}
