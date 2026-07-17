"use client";

import { useEffect, useState } from "react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";

// Página de erro do design (Transversal.dc.html): assume a culpa, diz o que
// fazer, sem stack traces. O código técnico fica no `digest`, não no ecrã.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [hora, setHora] = useState<string | null>(null);

  useEffect(() => {
    // TODO(integração): enviar para observabilidade quando existir o serviço.
    console.error(error);
  }, [error]);

  // Só depois de montar (evita divergência de hidratação com a hora do servidor).
  useEffect(() => {
    setHora(formatTime(new Date()));
  }, []);

  const codigo = error.digest ?? "FR-500";

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingHeader minimal />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-16 md:px-8">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div
            aria-hidden
            className="flex size-14 items-center justify-center rounded-full border-2 border-foreground"
          >
            <span className="font-display text-2xl font-extrabold">!</span>
          </div>
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-display">
            Isto foi culpa nossa
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            Não conseguimos carregar a página. Já fomos avisados; tenta outra vez — se estiveres
            numa live, ela continua a contar do sítio certo.
          </p>
          <Button size="lg" onClick={reset} className="mt-6">
            Tentar outra vez
          </Button>
          <p className="mt-4 font-mono text-2xs text-muted-foreground">
            erro {codigo}
            {hora ? ` · ${hora}` : ""}
          </p>
        </div>
      </main>
    </div>
  );
}
