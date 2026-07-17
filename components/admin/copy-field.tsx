"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Campo copy-to-clipboard (credenciais OBS e afins): valor em mono dentro de
// caixa clara, ação "Copiar" com sublinhado limão. `masked` esconde o valor
// por defeito (mostra só os últimos 4 caracteres) com toggle Mostrar/Ocultar.
export function CopyField({
  label,
  value,
  masked = false,
  className,
}: {
  label: string;
  value: string;
  masked?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(!masked);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sem clipboard (permissões): revela o valor para copiar à mão.
      setRevealed(true);
    }
  }

  const shown = revealed ? value : `••••••••${value.slice(-4)}`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-field px-3 py-2">
        <span className="truncate font-mono text-2sm font-medium">{shown}</span>
        <span className="flex shrink-0 items-center gap-3">
          {masked ? (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="cursor-pointer text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {revealed ? "Ocultar" : "Mostrar"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className="cursor-pointer text-xs font-semibold underline decoration-accent decoration-2 underline-offset-4"
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
          <span aria-live="polite" className="sr-only">
            {copied ? `${label} copiado` : ""}
          </span>
        </span>
      </div>
    </div>
  );
}
