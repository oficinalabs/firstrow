"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/*
 * Esta é a página da noite do evento. Um ecrã partido aqui, com a régie a
 * postos, é o pior momento para uma stack trace — por isso o boundary é próprio
 * (e não só o de /admin) e a frase diz o que interessa: a stream em si está do
 * lado da Cloudflare, não deste ecrã, e recarregar não a interrompe.
 */
export default function TransmissionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center">
      <EmptyState
        title="Este painel não carregou"
        description="É o painel que falhou, não a transmissão — se já estás no ar, continuas no ar. Tenta de novo; se persistir, as credenciais OBS que já tens na régie continuam válidas."
        action={
          <Button variant="secondary" onClick={reset}>
            Tentar de novo
          </Button>
        }
      />
    </div>
  );
}
