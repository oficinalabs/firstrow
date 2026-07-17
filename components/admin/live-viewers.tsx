"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/format";

type LiveCounts = { viewers: number; blockedToday: number };

// Espectadores em tempo real: valores do servidor à cabeça, polling de 10s
// ao endpoint da transmissão (só re-renderiza os números, não a página).
export function LiveViewers({
  eventId,
  initial,
  isLive,
}: {
  eventId: string;
  initial: LiveCounts;
  isLive: boolean;
}) {
  const [counts, setCounts] = useState(initial);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/admin/eventos/${eventId}/transmissao/live`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        setCounts((await res.json()) as LiveCounts);
      } catch {
        // Rede instável: mantém os últimos números; o próximo tick tenta de novo.
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [eventId]);

  return (
    <div className="grid grid-cols-2 gap-3.5">
      <StatCard
        label="A ver agora"
        value={formatNumber(counts.viewers)}
        hint={isLive ? "atualiza a cada 10s" : "a stream ainda não está no ar"}
      />
      <StatCard
        label="Sessões bloqueadas · hoje"
        value={formatNumber(counts.blockedToday)}
        hint="regra de 1 sessão por conta"
        hintTone={counts.blockedToday > 0 ? "destructive" : "muted"}
      />
    </div>
  );
}
