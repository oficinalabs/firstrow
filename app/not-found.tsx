import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { buttonVariants } from "@/components/ui/button";

// 404 do design (Transversal.dc.html): número gigante com sublinhado limão,
// tema light, barra tinta mínima no topo.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingHeader minimal />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-20 md:px-8">
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:gap-16">
          <div className="border-b-4 border-accent font-display text-8xl font-black leading-none tracking-tighter md:text-9xl">
            404
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-display md:text-3xl">
              Este lugar não existe.
            </h1>
            <p className="mt-2.5 max-w-[48ch] text-sm leading-relaxed text-muted-foreground md:text-base">
              O link pode estar errado ou o evento já não estar disponível. O espetáculo continua —
              encontra o teu lugar noutro sítio.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/" className={buttonVariants()}>
                Ir para o início
              </Link>
              <Link href="/sobre" className={buttonVariants({ variant: "secondary" })}>
                Conhecer a FirstRow
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
