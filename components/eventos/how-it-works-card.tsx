import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Cartão "como funciona": label mono + frases curtas (canal e página de evento). */
export function HowItWorksCard({
  title,
  lines,
  className,
}: {
  title: string;
  lines: string[];
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-2.5 bg-transparent p-5", className)}>
      <h3 className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {title}
      </h3>
      {lines.map((line) => (
        <p key={line} className="text-2sm leading-relaxed">
          {line}
        </p>
      ))}
    </Card>
  );
}
