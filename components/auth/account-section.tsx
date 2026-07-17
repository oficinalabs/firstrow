/*
 * Blocos da página de conta (design #conta-mobile): secção com label mono
 * uppercase e linhas divididas por hairline. Reutilizados por COMPRAS e DADOS.
 */

export function AccountSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h2 className="mb-1 font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {label}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/** Linha label ⇄ valor/ação (secção DADOS). */
export function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <span className="text-2sm text-foreground">{label}</span>
      <span className="text-2sm text-foreground-secondary">{children}</span>
    </div>
  );
}
