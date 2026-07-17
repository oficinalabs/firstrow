"use client";

import { useState, useTransition } from "react";
import { setEventStatus } from "@/app/admin/eventos/[id]/transmissao/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

// Transições de estado da stream (rascunho → no ar → terminado), uma ação
// visível de cada vez — chama a server action que atualiza events.status.
export function EventStatusActions({ eventId, status }: { eventId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function change(next: "draft" | "live" | "ended") {
    setError("");
    startTransition(async () => {
      const result = await setEventStatus({ eventId, status: next });
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {status === "draft" ? (
        <Button onClick={() => change("live")} disabled={pending} className="w-full">
          {pending ? "A pôr no ar…" : "Começar transmissão"}
        </Button>
      ) : null}
      {status === "live" ? (
        <Button
          variant="secondary"
          onClick={() => change("ended")}
          disabled={pending}
          className="w-full border-destructive text-destructive hover:bg-destructive/10"
        >
          {pending ? "A terminar…" : "Terminar transmissão"}
        </Button>
      ) : null}
      {status === "ended" ? (
        <Button
          variant="secondary"
          onClick={() => change("draft")}
          disabled={pending}
          className="w-full"
        >
          {pending ? "A reabrir…" : "Voltar a rascunho"}
        </Button>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}
