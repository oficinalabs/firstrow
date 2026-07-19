"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminEventoBilhetesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center">
      <EmptyState
        title="Não conseguimos carregar os bilhetes do evento"
        description="Tenta de novo. Se continuar, verifica a ligação à base de dados."
        action={
          <Button variant="secondary" onClick={reset}>
            Tentar de novo
          </Button>
        }
      />
    </div>
  );
}
