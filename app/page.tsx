export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <span className="text-sm font-medium uppercase tracking-widest text-foreground/50">
        FirstRow
      </span>
      <h1 className="text-4xl font-medium tracking-tight text-balance">
        Streaming e conteúdo pago com acesso controlado.
      </h1>
      <p className="text-lg leading-relaxed text-foreground/70">
        Vende lives, arquivo de VOD e conteúdo exclusivo — sem perder dinheiro para links
        partilhados. Scaffold inicial; o plano está em{" "}
        <code className="font-mono text-sm">docs/</code>.
      </p>
      <div className="text-sm text-foreground/50">
        Next.js · Better Auth · Drizzle · Cloudflare Stream · Eupago (MB WAY)
      </div>
    </main>
  );
}
