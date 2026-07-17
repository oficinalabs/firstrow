"use client";

import { useNow } from "@/components/eventos/use-now";
import { cn } from "@/lib/utils";

// Contagem decrescente do hero (dias · horas · min). Os números podem divergir
// um minuto entre servidor e cliente na hidratação — daí o suppressHydrationWarning.
export function CountdownTimer({
  target,
  className,
}: {
  target: Date | string | number;
  className?: string;
}) {
  const now = useNow(15_000);
  const remaining = Math.max(0, new Date(target).getTime() - now);

  const boxes = [
    { value: Math.floor(remaining / 86_400_000), label: "dias" },
    { value: Math.floor((remaining % 86_400_000) / 3_600_000), label: "horas" },
    { value: Math.floor((remaining % 3_600_000) / 60_000), label: "min" },
  ];

  return (
    <div className={cn("flex gap-1.5 md:gap-2", className)}>
      {boxes.map((box) => (
        <div
          key={box.label}
          className="min-w-14 flex-1 rounded-sm border px-2 py-1.5 text-center md:flex-none md:px-3"
        >
          <div suppressHydrationWarning className="font-mono text-xl font-semibold">
            {String(box.value).padStart(2, "0")}
          </div>
          <div className="font-mono text-2xs text-muted-foreground">{box.label}</div>
        </div>
      ))}
    </div>
  );
}
