"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ViewerShell } from "@/components/ui/viewer-shell";

export default function EventError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ViewerShell active="canal">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
        <EmptyState
          title="Não conseguimos abrir este evento"
          description="Foi um problema do nosso lado. Tenta outra vez — se continuar, volta ao canal e entra de novo pelo evento."
          action={
            <>
              <Button onClick={reset}>Tentar outra vez</Button>
              <Link href="/" className={buttonVariants({ variant: "ghost" })}>
                Voltar ao canal
              </Link>
            </>
          }
        />
      </div>
    </ViewerShell>
  );
}
