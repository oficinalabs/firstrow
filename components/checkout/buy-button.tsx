"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConsentGate } from "@/components/checkout/consent-gate";
import { useNow } from "@/components/eventos/use-now";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PulseDot } from "@/components/ui/live-badge";
import { formatDateTime, formatEuro, formatPhone } from "@/lib/format";
import type { CopiaCliente } from "@/lib/legal/consentimentos";
import { cn } from "@/lib/utils";

// MB WAY cancela pedidos ao fim de 5 minutos (ver docs/PAGAMENTOS.md).
const PENDING_MS = 5 * 60 * 1000;
const POLL_MS = 4000;

type Status = "idle" | "submitting" | "pending" | "active" | "expired" | "error";

type Props = {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  priceCents: number;
  channelName: string;
  /*
   * O texto de consentimento a mostrar antes do botão — vem do servidor já com
   * o `kind` certo (ppv para live, vod para arquivo) e a versão em vigor. O
   * cliente devolve a versão, não o texto: a prova reconstrói-se no servidor.
   */
  consent: CopiaCliente;
};

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function calendarUrl(title: string, startsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function BuyButton({
  eventId,
  eventTitle,
  startsAt,
  priceCents,
  channelName,
  consent,
}: Props) {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [pendingUntil, setPendingUntil] = useState<number | null>(null);
  // Renúncia ao direito de resolução. Arranca a false — a checkbox nunca vem
  // pré-marcada (regra da secção 6).
  const [consentAceite, setConsentAceite] = useState(false);
  const [consentErro, setConsentErro] = useState("");
  const now = useNow(1000);

  // Arquivo (vod) vs. live: muda só o rótulo, não o fluxo.
  const isVod = consent.kind === "vod";
  const produto = isVod ? "o vídeo" : "a live";
  // O botão só desbloqueia com a renúncia marcada quando o caso a exige.
  const consentFalta = consent.checkbox !== null && !consentAceite;

  // Polling do entitlement enquanto o pedido está pendente (o webhook ativa-o).
  useEffect(() => {
    if (status !== "pending") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/entitlements/${eventId}`);
      const data = (await res.json().catch(() => ({ active: false }))) as { active: boolean };
      if (data.active) setStatus("active");
    }, POLL_MS);
    return () => clearInterval(id);
  }, [status, eventId]);

  // Expira o pedido no cliente quando o contador chega a zero.
  useEffect(() => {
    if (status === "pending" && pendingUntil && now >= pendingUntil) setStatus("expired");
  }, [status, pendingUntil, now]);

  function aceitarConsentimento(v: boolean) {
    setConsentAceite(v);
    // Erro silencia-se assim que a pessoa mexe no campo — não fica a martelar.
    if (v) setConsentErro("");
  }

  async function pay() {
    // Guarda do cliente, antes de tocar no servidor: sem a renúncia marcada não
    // avançamos, e o estado fica em idle para a checkbox continuar à vista. A
    // recusa a sério é no servidor — isto só poupa uma ida e volta.
    if (consentFalta) {
      setConsentErro("Marca a confirmação para continuares.");
      return;
    }

    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch(`/api/checkout/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          consentVersao: consent.versao,
          consentAceite,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(body.error ?? "O MB WAY não aceitou o pedido.");
        setStatus("error");
        return;
      }
      setPendingUntil(Date.now() + PENDING_MS);
      setStatus("pending");
    } catch {
      setMessage("Não foi possível contactar o MB WAY. Verifica a ligação e tenta outra vez.");
      setStatus("error");
    }
  }

  function reset() {
    setPendingUntil(null);
    setMessage("");
    setStatus("idle");
  }

  if (status === "active") {
    return (
      <div className="flex flex-col items-center gap-3.5 py-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-success text-success-foreground">
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
            <polyline
              points="5,12.5 10,17.5 19,7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-extrabold">Estás dentro.</h1>
        <p className="max-w-72 text-2sm leading-relaxed text-foreground-secondary">
          O acesso a {produto}{" "}
          <strong className="font-semibold text-foreground">
            {eventTitle} — {formatDateTime(startsAt)}
          </strong>{" "}
          ficou na tua conta.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2.5">
          <Link href={`/eventos/${eventId}`} className={buttonVariants({ size: "lg" })}>
            Ir para o evento
          </Link>
          {!isVod ? (
            <a
              href={calendarUrl(eventTitle, startsAt)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary" })}
            >
              Adicionar ao calendário
            </a>
          ) : null}
        </div>
        <p className="mt-2 flex w-full items-center justify-center border-t border-accent pt-3 font-mono text-2xs text-muted-foreground">
          FIRSTROW · lugar garantido na primeira fila
        </p>
      </div>
    );
  }

  if (status === "pending") {
    const remaining = pendingUntil ? pendingUntil - now : PENDING_MS;
    return (
      <div className="flex flex-col items-center gap-3.5 py-8 text-center">
        <div className="flex items-center gap-1.5 text-foreground">
          <PulseDot className="size-2" />
          <PulseDot className="size-2 [animation-delay:0.25s]" />
          <PulseDot className="size-2 [animation-delay:0.5s]" />
        </div>
        <h1 className="font-display text-2xl font-extrabold">Confirma na app MB WAY</h1>
        <p className="max-w-72 text-2sm leading-relaxed text-foreground-secondary">
          Enviámos um pedido de{" "}
          <strong className="font-semibold text-foreground">{formatEuro(priceCents)}</strong> para{" "}
          <span className="font-mono text-2sm text-foreground">+351 {formatPhone(phone)}</span>.
          Abre a app e aceita o pagamento.
        </p>
        <div
          suppressHydrationWarning
          className="mt-1 font-mono text-4xl font-semibold tracking-wide"
        >
          {mmss(remaining)}
        </div>
        <p className="text-xs text-foreground-secondary">o pedido expira ao fim de 5 minutos</p>
        <div className="mt-2 flex w-full flex-col gap-2.5">
          <Button variant="secondary" onClick={pay}>
            Não recebi o pedido — reenviar
          </Button>
          <Button variant="ghost" onClick={reset}>
            Cancelar pagamento
          </Button>
        </div>
      </div>
    );
  }

  if (status === "expired" || status === "error") {
    return (
      <div className="flex flex-col items-center gap-3.5 py-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-warning font-display text-3xl font-extrabold text-warning-foreground">
          !
        </div>
        <h1 className="font-display text-2xl font-extrabold">
          {status === "error" ? "O pagamento não avançou" : "O pedido expirou"}
        </h1>
        <p className="max-w-72 text-2sm leading-relaxed text-foreground-secondary">
          {status === "error"
            ? message
            : "O MB WAY cancela pedidos ao fim de 5 minutos. Não foi cobrado nada — podes tentar outra vez quando quiseres."}
        </p>
        <div className="mt-2 flex w-full flex-col gap-2.5">
          {/* A renúncia já foi dada para chegar aqui — só se repete o pedido. */}
          <Button size="lg" onClick={pay} disabled={phone.length < 9}>
            Tentar outra vez
          </Button>
          <Link href={`/eventos/${eventId}`} className={buttonVariants({ variant: "ghost" })}>
            Voltar ao evento
          </Link>
        </div>
      </div>
    );
  }

  // idle | submitting
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
          Pagamento seguro · MB WAY
        </p>
        <h1 className="mt-1.5 font-display text-xl font-extrabold">Confirmar a compra</h1>
      </div>

      <Card className="p-4">
        <div className="flex justify-between gap-3 border-b pb-2.5">
          <div className="min-w-0">
            <div className="text-2sm font-semibold">
              {isVod ? "Acesso ao vídeo" : "Acesso à live"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {eventTitle} · {formatDateTime(startsAt)} · {channelName}
            </div>
          </div>
          <span className="shrink-0 font-mono text-2sm">{formatEuro(priceCents)}</span>
        </div>
        <div className="flex justify-between pt-2.5">
          <span className="text-2sm font-semibold">Total</span>
          <span className="font-mono text-sm font-semibold">{formatEuro(priceCents)}</span>
        </div>
      </Card>

      <Field>
        <FieldLabel htmlFor="mbway-phone">Telemóvel MB WAY</FieldLabel>
        <div className="flex">
          <span className="inline-flex h-11 shrink-0 items-center rounded-l-sm border border-r-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground">
            +351
          </span>
          <Input
            id="mbway-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="912 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={cn("rounded-l-none font-mono")}
          />
        </div>
      </Field>

      {/* Consentimento — antes do botão, como a lei exige. Para a live é
          informativo + renúncia; para o arquivo é só a renúncia aos 14 dias. */}
      <ConsentGate
        copy={consent}
        accepted={consentAceite}
        onAcceptedChange={aceitarConsentimento}
        error={consentErro}
      />

      <Button
        size="lg"
        onClick={pay}
        disabled={status === "submitting" || phone.length < 9 || consentFalta}
      >
        {status === "submitting" ? "A enviar…" : `Pagar ${formatEuro(priceCents)}`}
      </Button>

      <FieldHint>
        Vais receber um pedido na app MB WAY. Tens 5 minutos para confirmar — não é cobrado nada
        antes disso.
      </FieldHint>

      {/* Aceite genérico dos termos, por texto e distinto da renúncia acima —
          são consentimentos diferentes e não se misturam num só sítio. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Ao pagar, aceitas os{" "}
        <Link href="/legal/termos" className="underline underline-offset-2 hover:text-foreground">
          Termos
        </Link>{" "}
        e a{" "}
        <Link
          href="/legal/privacidade"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Política de Privacidade
        </Link>
        .
      </p>
    </div>
  );
}
