import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Resultado da validação à porta — UM componente, quatro variantes. Ecrã
 * inteiro, texto GIGANTE, cores só dos tokens: verde entra, vermelho não,
 * laranja é engano de evento. Desenhado para a noite, com fila.
 */
export type ScanOutcome =
  | { resultado: "valido"; codigo: string; nome: string; usedAt: string }
  | { resultado: "ja_usado"; codigo: string; nome: string; usedAt: string | null }
  | {
      resultado: "evento_errado";
      codigo: string;
      nome: string;
      eventoTitulo: string;
      eventoStartsAt: string;
    }
  | { resultado: "invalido" };

const SURFACE: Record<ScanOutcome["resultado"], string> = {
  valido: "bg-success text-success-foreground",
  ja_usado: "bg-destructive text-destructive-foreground",
  evento_errado: "bg-warning text-accent-foreground",
  invalido: "bg-destructive text-destructive-foreground",
};

export function ScanResult({ outcome, onNext }: { outcome: ScanOutcome; onNext: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center",
          SURFACE[outcome.resultado],
        )}
      >
        {outcome.resultado === "valido" && (
          <>
            <p className="font-display text-4xl font-black tracking-display">VÁLIDO</p>
            <p className="font-mono text-base font-bold uppercase tracking-label opacity-90">
              1ª entrada
            </p>
            <p className="mt-2 text-lg font-semibold">{outcome.nome} · 1 × Geral</p>
            <p className="font-mono text-2sm opacity-90">
              {outcome.codigo} · {formatTime(outcome.usedAt)}
            </p>
          </>
        )}

        {outcome.resultado === "ja_usado" && (
          <>
            <p className="font-display text-4xl font-black tracking-display">JÁ USADO</p>
            {outcome.usedAt ? (
              <p className="font-mono text-base font-bold uppercase tracking-label opacity-90">
                às {formatTime(outcome.usedAt)}
              </p>
            ) : null}
            <p className="mt-2 text-base font-semibold">
              {outcome.codigo} · {outcome.nome}
            </p>
            <p className="max-w-[30ch] text-2sm leading-relaxed opacity-90">
              Este QR já entrou. Se a pessoa insiste, confirma o nome no documento.
            </p>
            <Button
              variant="secondary"
              onClick={onNext}
              className="mt-3 border-current bg-transparent text-current hover:bg-transparent"
            >
              Deixar entrar na mesma
            </Button>
          </>
        )}

        {outcome.resultado === "evento_errado" && (
          <>
            <p className="font-display text-3xl font-black tracking-display">OUTRO EVENTO</p>
            <p className="font-mono text-2sm font-bold uppercase tracking-label opacity-80">
              {outcome.eventoTitulo} · {formatDate(outcome.eventoStartsAt)}
            </p>
            <p className="mt-2 text-base font-semibold">
              {outcome.codigo} · {outcome.nome}
            </p>
            <p className="max-w-[30ch] text-2sm leading-relaxed opacity-80">
              O bilhete é de outro evento. O bilhete de hoje está na conta do comprador, em "Os meus
              bilhetes".
            </p>
          </>
        )}

        {outcome.resultado === "invalido" && (
          <>
            <p className="font-display text-3xl font-black tracking-display">INVÁLIDO</p>
            <p className="mt-2 max-w-[30ch] text-2sm leading-relaxed opacity-90">
              Este código não corresponde a nenhum bilhete emitido. Confirma no ecrã do comprador.
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="h-14 shrink-0 cursor-pointer bg-bar text-base font-semibold text-bar-foreground"
      >
        Seguinte →
      </button>
    </div>
  );
}
