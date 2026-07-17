import type { ReactNode } from "react";

/*
 * Banda de chamada-à-ação em tinta, reutilizada na homepage e em /criadores.
 * data-theme="dark" faz os botões (Button/buttonVariants) inverterem para claro
 * sobre a barra, como no design. O fundo usa bar-* (tinta em qualquer tema).
 */
export function CtaBand({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  actions: ReactNode;
}) {
  return (
    <section data-theme="dark" className="bg-bar text-bar-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="font-mono text-2xs font-medium uppercase tracking-label text-accent">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-2.5 font-display text-2xl font-extrabold tracking-display text-balance md:text-3xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-3 max-w-prose text-2sm leading-relaxed text-bar-muted md:text-sm">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
      </div>
    </section>
  );
}
