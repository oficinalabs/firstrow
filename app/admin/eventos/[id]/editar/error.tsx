"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// O que carrega este ecrã é o evento e as vendas dele; se isso falhar, a saída
// honesta é tentar de novo. Um error boundary próprio (e não só o de /admin)
// para a frase falar do que a pessoa estava mesmo a fazer.
export default function EditEventError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center">
      <EmptyState
        title="Não conseguimos abrir este evento para edição"
        description="Falhou a ligação à base de dados ou algo do nosso lado. O evento e as vendas dele estão bem — tenta de novo."
        action={
          <Button variant="secondary" onClick={reset}>
            Tentar de novo
          </Button>
        }
      />
    </div>
  );
}
