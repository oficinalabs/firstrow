import type { Metadata } from "next";
import { CtaBand } from "@/components/marketing/cta-band";
import {
  buildMailto,
  comparacaoColunas,
  comparacaoLinhas,
  taxasLead,
  taxasNota,
} from "@/components/marketing/dados";
import { FeatureRow } from "@/components/marketing/feature-row";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const HERO_SUB =
  "Publicas o evento, partilhas o link, e cada visualização é uma venda: sem links " +
  "partilháveis, 1 sessão por conta, watermark com o email de quem vê. Lives, arquivo, " +
  "subscrições e bilhetes físicos — num só sítio, pagos por MB WAY.";

const MAILTO_CRIAR = buildMailto("Quero abrir um canal na FirstRow");
const MAILTO_FALAR = buildMailto("Queria saber mais sobre a FirstRow");

export const metadata: Metadata = {
  title: "Para criadores e ligas",
  description:
    "Vende lives, arquivo e bilhetes à prova de fugas. 10% de taxa, tudo incluído, pagamentos por MB WAY e payout semanal.",
  alternates: { canonical: "/criadores" },
  openGraph: {
    title: "FirstRow para criadores — vender acesso não devia ser um ato de fé",
    description:
      "Lives PPV à prova de fugas, arquivo, subscrições e bilhetes com scanner. 10% de taxa, tudo incluído.",
    url: "/criadores",
    type: "website",
    images: [{ url: "/brand/og/criadores.png", width: 1200, height: 630, alt: "FirstRow" }],
  },
};

export default function CriadoresPage() {
  return (
    <>
      {/* Hero B2B */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <div className="max-w-3xl">
          <p className="font-mono text-2xs font-medium uppercase tracking-label text-muted-foreground">
            Para criadores, ligas e organizações
          </p>
          <h1 className="mt-3.5 font-display text-3xl font-extrabold leading-[1.05] tracking-display text-balance md:text-4xl">
            Vender acesso não devia ser um ato de fé.
          </h1>
          <p className="mt-4 max-w-[58ch] text-base leading-relaxed text-foreground-secondary md:text-lg">
            {HERO_SUB}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={MAILTO_CRIAR} className={buttonVariants({ size: "lg" })}>
              Criar canal
            </a>
            <a href={MAILTO_FALAR} className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Falar connosco
            </a>
          </div>
        </div>
      </section>

      {/* Taxas — números reais, fonte citada */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
        <h2 className="border-b-2 border-foreground pb-3 font-display text-2xl font-extrabold tracking-display">
          Uma taxa. Sem letras pequenas.
        </h2>
        <p className="mt-4 max-w-[68ch] text-2sm leading-relaxed text-foreground-secondary md:text-sm">
          {taxasLead}
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <td className="w-2/5 py-3 pr-4" />
                {comparacaoColunas.map((coluna, i) => (
                  <th
                    key={coluna}
                    scope="col"
                    className={
                      i === 0
                        ? "whitespace-nowrap border-b-2 border-accent bg-card px-3 py-3 font-display text-sm font-bold"
                        : "whitespace-nowrap border-b border-border px-3 py-3 text-2sm font-semibold text-muted-foreground"
                    }
                  >
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparacaoLinhas.map((linha) => (
                <tr key={linha.criterio}>
                  <th
                    scope="row"
                    className="border-b border-border py-3 pr-4 text-2sm font-normal text-foreground"
                  >
                    {linha.criterio}
                  </th>
                  {linha.valores.map((valor, i) => (
                    <td
                      key={comparacaoColunas[i]}
                      className={
                        i === 0
                          ? "whitespace-nowrap border-b border-border bg-card px-3 py-3 font-mono text-2sm font-semibold text-foreground"
                          : "whitespace-nowrap border-b border-border px-3 py-3 font-mono text-2sm text-muted-foreground"
                      }
                    >
                      {valor}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-mono text-2xs leading-relaxed text-muted-foreground">{taxasNota}</p>
      </section>

      {/* Provas — linhas editoriais */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
        <FeatureRow
          eyebrow="Anti-fuga"
          title="Quem não paga, não vê. Mesmo."
          description="Sem links partilháveis — o acesso vive na conta. Uma sessão de cada vez: se a conta abrir noutro sítio, a primeira pára. E cada frame leva o email de quem está a ver."
          visual={
            <div
              data-theme="dark"
              className="relative aspect-video overflow-hidden rounded-sm bg-bar"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="-rotate-12 whitespace-nowrap font-mono text-2xs text-bar-muted/60">
                  fulano@email.pt · FirstRow · 21:47
                </span>
              </div>
            </div>
          }
        />
        <FeatureRow
          eyebrow="Live + arquivo + subscrições"
          title="O evento paga-se três vezes."
          description="PPV na noite, replay de 48h, e o arquivo a render como subscrição no mês seguinte. Transmites por OBS com o RTMP do evento — mais nada."
          visual={
            <Card className="p-4">
              <div className="flex flex-col gap-2 font-mono text-2xs">
                <span className="text-muted-foreground">SERVIDOR RTMP</span>
                <span className="text-foreground">rtmp://in.joinfirstrow.com/live</span>
                <span className="mt-2 text-muted-foreground">CHAVE DA STREAM</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground">fr_live_••••••••7k2m</span>
                  <span className="font-sans font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-2">
                    Copiar
                  </span>
                </div>
              </div>
            </Card>
          }
        />
        <FeatureRow
          eyebrow="Bilhetes físicos"
          title="A porta também é nossa."
          description="Vendes bilhetes com lotação, o público mostra o QR, tu validas com o telemóvel — verde entra, vermelho não. Lista de compradores e exportação CSV incluídas."
          visual={
            <Card className="flex flex-wrap items-center justify-center gap-2 p-5">
              <Badge variant="success">Válido — 1ª entrada</Badge>
              <Badge variant="destructive">Já usado 21:34</Badge>
            </Card>
          }
        />
      </section>

      <CtaBand
        title="Abre o teu canal esta semana."
        actions={
          <>
            <a href={MAILTO_CRIAR} className={buttonVariants()}>
              Criar canal
            </a>
            <a href={MAILTO_FALAR} className={buttonVariants({ variant: "secondary" })}>
              Falar connosco
            </a>
          </>
        }
      />
    </>
  );
}
