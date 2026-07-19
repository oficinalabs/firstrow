import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/marketing/cta-band";
import { categorias, passosEspectador } from "@/components/marketing/dados";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { channelPath, defaultChannel } from "@/lib/channels";

const HERO_SUB =
  "Lives, arquivo e bilhetes dos canais que valem a pena pagar — comédia, música, " +
  "batalhas, esports, formação. Pagas com MB WAY, vês em qualquer lado. Quem não paga, não entra.";

export const metadata: Metadata = {
  title: "Sobre a FirstRow",
  description: HERO_SUB,
  alternates: { canonical: "/sobre" },
  openGraph: {
    title: "FirstRow — o melhor lugar não é grátis. É o teu.",
    description: HERO_SUB,
    url: "/sobre",
    type: "website",
    images: [{ url: "/brand/og/sobre.png", width: 1200, height: 630, alt: "FirstRow" }],
  },
};

export default function SobrePage() {
  return (
    <>
      {/* Hero — espectador primeiro, com o canal piloto ao lado (honesto). */}
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:items-start md:px-8 md:py-24">
        <div>
          <h1 className="font-display text-3xl font-extrabold leading-[1.04] tracking-display text-balance md:text-4xl">
            O melhor lugar não é grátis.
            <br />É o teu.
          </h1>
          <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-foreground-secondary md:text-lg">
            {HERO_SUB}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/" className={buttonVariants({ size: "lg" })}>
              Explorar canais
            </Link>
            <Link href="/entrar" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Tenho um convite de canal
            </Link>
          </div>
        </div>

        <Card
          className="overflow-hidden"
          style={{ "--tenant": defaultChannel.accentColor } as React.CSSProperties}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-display text-2sm font-bold">O primeiro canal na FirstRow</span>
            <Badge variant="accent">Piloto</Badge>
          </div>
          <div className="flex items-center gap-3 px-4 py-4">
            <div
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-muted font-display text-base font-bold text-foreground"
            >
              {defaultChannel.initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{defaultChannel.name}</div>
              <div className="truncate text-2sm text-muted-foreground">
                {defaultChannel.tagline}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-3">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--tenant)" />
            <span className="text-2sm text-muted-foreground">
              Lives, arquivo e bilhetes à porta
            </span>
          </div>
          <div className="border-t border-border p-3">
            <Link
              href={channelPath(defaultChannel)}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "w-full" })}
            >
              Ver o canal
            </Link>
          </div>
        </Card>
      </section>

      {/* Como funciona — 3 passos do design (borda-esquerda tinta, editorial). */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
        <div className="grid gap-x-6 gap-y-8 sm:grid-cols-3">
          {passosEspectador.map((passo, i) => (
            <div key={passo.titulo} className="border-l-2 border-foreground pl-4">
              <span className="font-mono text-2xs font-medium tracking-label text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1.5 font-display text-base font-bold">{passo.titulo}</h3>
              <p className="mt-1 text-2sm leading-relaxed text-muted-foreground">{passo.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* O que vais encontrar — categorias como tira editorial, sem eventos falsos. */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 md:px-8">
        <div className="border-t-2 border-foreground pt-4">
          <SectionHeader eyebrow="Feito para quem cobra à porta" title="O que vais encontrar" />
          <p className="mt-3 max-w-[60ch] text-2sm leading-relaxed text-muted-foreground md:text-sm">
            A FirstRow é para qualquer canal que viva de público que paga. Estamos a começar com as
            batalhas escritas — e a abrir a outros feitios de espetáculo pago.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {categorias.map((cat) => (
              <Badge key={cat} variant="outline">
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="Para criadores e ligas"
        title={
          <>
            Traz o teu público.
            <br />
            Nós fechamos a porta.
          </>
        }
        description="Lives pay-per-view, arquivo, subscrições e bilhetes físicos com scanner — com 10% de taxa, tudo incluído, e sem links piratas a comerem-te a bilheteira."
        actions={
          <Link href="/criadores" className={buttonVariants()}>
            Para criadores ›
          </Link>
        }
      />
    </>
  );
}
