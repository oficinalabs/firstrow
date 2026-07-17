"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ViewerShell } from "@/components/ui/viewer-shell";

export default function BilhetesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ViewerShell active="bilhetes">
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-6">
        <EmptyState
          title="Não conseguimos carregar os bilhetes"
          description="A culpa é nossa. Tenta de novo — se não resolver, fala connosco."
          action={
            <Button variant="secondary" onClick={reset}>
              Tentar de novo
            </Button>
          }
        />
      </section>
    </ViewerShell>
  );
}
