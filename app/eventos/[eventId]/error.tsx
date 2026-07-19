"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ViewerShell } from "@/components/ui/viewer-shell";

/*
 * Este boundary corre no cliente e a seguir a uma falha — não tem evento nem
 * canal em mão, e ir buscá-los era arriscar falhar outra vez. Por isso a
 * moldura fica só FirstRow (sem cor de canal) e o caminho de saída é a visão
 * geral, de onde se chega a qualquer canal.
 *
 * Antes mostrava a cor e o link do canal por defeito, o que num erro na página
 * de um evento de outra liga mandava a pessoa para a liga errada.
 */
export default function EventError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ViewerShell active="inicio">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
        <EmptyState
          title="Não conseguimos abrir este evento"
          description="Foi um problema do nosso lado. Tenta outra vez — se continuar, volta ao início e entra de novo pelo evento."
          action={
            <>
              <Button onClick={reset}>Tentar outra vez</Button>
              <Link href="/" className={buttonVariants({ variant: "ghost" })}>
                Voltar ao início
              </Link>
            </>
          }
        />
      </div>
    </ViewerShell>
  );
}
