import { ViewerShell } from "@/components/ui/viewer-shell";
import { tenant } from "@/lib/tenant";

// Landing temporária (a Frente B substitui-a pela página de canal).
export default function Home() {
  return (
    <ViewerShell active="canal">
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-6 px-4 py-20 md:px-8 md:py-28">
        <span className="font-mono text-2xs font-medium uppercase tracking-label text-muted-foreground">
          Lives · Bilhetes · Subscrições
        </span>
        <h1 className="max-w-[16ch] font-display text-3xl font-extrabold tracking-display text-balance md:text-4xl">
          A tua primeira fila.
        </h1>
        <p className="max-w-[52ch] text-base leading-relaxed text-foreground-secondary">
          Streaming e conteúdo pago com acesso controlado. Compras com MB WAY e vês em qualquer
          dispositivo — uma sessão por conta, sem links partilháveis.
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-(--tenant)" />
          <span>
            Primeiro canal: <span className="font-semibold text-foreground">{tenant.name}</span> —{" "}
            {tenant.tagline}
          </span>
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          Next.js · Better Auth · Drizzle · Cloudflare Stream · Eupago (MB WAY)
        </p>
      </section>
    </ViewerShell>
  );
}
