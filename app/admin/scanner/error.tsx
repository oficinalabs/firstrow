"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminScannerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      data-theme="dark"
      className="flex min-h-dvh flex-col justify-center bg-bar px-4 text-bar-foreground"
    >
      <EmptyState
        title="O scanner tropeçou"
        description="Tenta de novo. Se a rede da porta estiver fraca, valida pelos códigos escritos."
        action={
          <Button variant="secondary" onClick={reset}>
            Tentar de novo
          </Button>
        }
      />
    </div>
  );
}
