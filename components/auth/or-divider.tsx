/** Divisor "OU" entre a ação principal e a alternativa (entrar ⇄ registar). */
export function OrDivider() {
  return (
    <div aria-hidden className="my-1.5 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="font-mono text-2xs text-muted-foreground">OU</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
