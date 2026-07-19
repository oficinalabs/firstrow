"use client";

import { useState, useTransition } from "react";
import { provisionStreamAction } from "@/app/admin/eventos/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

/**
 * Volta a pedir a stream a um evento que ficou sem ela.
 *
 * Existe por um beco real: a Cloudflare pode falhar no momento em que o evento é
 * criado, e um evento sem live input não transmite. A única cura era apagar e
 * criar outro — mas apagar RECUSA se já houve vendas, por isso um evento vendido
 * ficava morto. Este botão é a saída sem apagar nada.
 */
export function ProvisionStreamButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function retry() {
    setError("");
    startTransition(async () => {
      const result = await provisionStreamAction(eventId);
      // Sucesso não precisa de mensagem: a página revalida e passa a mostrar as
      // credenciais. Só o erro é que tem de aparecer.
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Button variant="secondary" onClick={retry} disabled={pending} className="w-full">
        {pending ? "A pedir a stream…" : "Tentar criar a stream outra vez"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
