"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Vista de erro partilhada pelos error.tsx do backoffice.
export function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      className="mt-6"
      title="Isto não carregou"
      description="Falhou a ligação à base de dados ou algo do nosso lado. Os teus dados estão bem — tenta de novo."
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
