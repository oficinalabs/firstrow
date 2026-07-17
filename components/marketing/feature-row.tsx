import type { ReactNode } from "react";

/*
 * Linha editorial de /criadores: texto à esquerda, ilustração à direita,
 * separadas por hairline em cima. Alternativa deliberada à grelha de 3 features
 * simétrica — mantém o look editorial aprovado.
 */
export function FeatureRow({
  eyebrow,
  title,
  description,
  visual,
}: {
  eyebrow: string;
  title: string;
  description: string;
  visual: ReactNode;
}) {
  return (
    <div className="grid items-center gap-8 border-t border-border py-8 md:grid-cols-[1fr_360px] md:gap-12">
      <div>
        <p className="font-mono text-2xs font-medium uppercase tracking-label text-muted-foreground">
          {eyebrow}
        </p>
        <h3 className="mt-2 font-display text-xl font-bold tracking-display">{title}</h3>
        <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="w-full">{visual}</div>
    </div>
  );
}
