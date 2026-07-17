"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = "idle" | "submitting" | "pending" | "issued" | "error";

/*
 * CTA de compra de bilhete físico (MB WAY) para a página de evento — a Frente B
 * monta <TicketCta eventId={…} priceCents={…} /> no slot de bilhetes.
 * Espelha o BuyButton: telemóvel → pendente → poll até o webhook emitir o QR.
 */
export function TicketCta({ eventId, priceCents }: { eventId: string; priceCents: number }) {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function pay() {
    setStatus("submitting");
    setMessage("");

    const res = await fetch(`/api/tickets/checkout/${eventId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setMessage(
        res.status === 401
          ? "Entra na tua conta primeiro — o bilhete fica associado a ela."
          : (body.error ?? "Não conseguimos iniciar o pagamento. Tenta outra vez."),
      );
      return;
    }

    const data = (await res.json()) as { ticketId: string };
    setStatus("pending");
    setMessage("Confirma o pagamento na app MB WAY (tens 5 minutos).");
    startPolling(data.ticketId);
  }

  function startPolling(ticketId: string) {
    const started = Date.now();
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/tickets/status/${ticketId}`);
      const data = (await res.json().catch(() => ({}))) as { status?: string };
      if (data.status === "issued") {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("issued");
      } else if (Date.now() - started > 6 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("error");
        setMessage("O pedido MB WAY expirou. Tenta outra vez.");
      }
    }, 4000);
  }

  if (status === "issued") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-success">Bilhete emitido.</p>
        <Link href="/bilhetes" className={cn(buttonVariants({ size: "lg" }), "w-fit")}>
          Ver o meu bilhete
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="tel"
        inputMode="tel"
        placeholder="Telemóvel MB WAY (ex: 912345678)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        aria-label="Telemóvel MB WAY"
      />
      <Button
        size="lg"
        onClick={pay}
        disabled={status === "submitting" || status === "pending" || phone.trim().length < 9}
      >
        {status === "pending"
          ? "À espera do MB WAY…"
          : `Comprar bilhete · ${formatEuro(priceCents)}`}
      </Button>
      {status === "error" ? (
        <FieldError>{message}</FieldError>
      ) : message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}
