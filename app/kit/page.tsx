import type { Metadata } from "next";
import Image from "next/image";
import { BackofficeShell } from "@/components/ui/backoffice-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LiveBadge, PulseDot } from "@/components/ui/live-badge";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatEuro, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

// Página interna de verificação visual do kit (fundação, Frente A):
// os mesmos componentes renderizados em light e dark, para comparar com
// design/FirstRow Plataforma/Plataforma - Tokens.dc.html.
export const metadata: Metadata = {
  title: "Kit de design",
  robots: { index: false },
};

const SALES = [
  {
    date: new Date("2026-07-12T18:04:00Z"),
    buyer: "Marta Silveira",
    item: "SB Clash #14 · PPV",
    cents: 750,
  },
  {
    date: new Date("2026-07-12T15:31:00Z"),
    buyer: "João Tavares",
    item: "SB Clash #14 · Bilhete",
    cents: 1200,
  },
  {
    date: new Date("2026-07-11T21:12:00Z"),
    buyer: "André Boavida",
    item: "Subscrição · Primeira Fila",
    cents: 999,
  },
];

export default function KitPage() {
  return (
    <div className="min-h-dvh bg-bar pb-10 text-bar-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-5 md:px-8">
        <Image src="/brand/firstrow-lockup-h-branco.svg" alt="FirstRow" width={99} height={24} />
        <span className="font-mono text-2xs text-bar-muted">
          KIT DE DESIGN · INTERNO · LIGHT + DARK
        </span>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 md:px-8 lg:grid-cols-2">
        <KitColumn theme="light" />
        <KitColumn theme="dark" />
      </div>
      <div className="mx-auto mt-4 flex w-full max-w-6xl flex-col gap-3 px-4 md:px-8">
        <span className="font-mono text-2xs uppercase tracking-label text-bar-muted">
          Shell do backoffice — sidebar tinta, conteúdo em papel
        </span>
        <div className="h-140 overflow-hidden rounded-sm">
          <BackofficePreview />
        </div>
      </div>
    </div>
  );
}

function BackofficePreview() {
  const stats = [
    { label: "Vendidos", value: `${formatNumber(187)}/${formatNumber(250)}` },
    { label: "Receita bilhetes", value: formatEuro(224400) },
    { label: "Já entraram", value: formatNumber(121), tone: "text-success" },
    { label: "Recusados à porta", value: formatNumber(3), tone: "text-destructive" },
  ];
  return (
    <BackofficeShell activeHref="/admin/eventos">
      <div className="flex flex-col gap-4">
        <SectionHeader
          eyebrow="Eventos ‹"
          title="SB Clash #14 — Final de Verão"
          action={<Button size="sm">Abrir scanner de porta</Button>}
        />
        <div className="grid gap-3.5 md:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <span className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
                {stat.label}
              </span>
              <div className={cn("mt-1.5 font-mono text-xl font-semibold", stat.tone)}>
                {stat.value}
              </div>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Compradores</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Comprador</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead numeric>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SALES.map((sale) => (
                  <TableRow key={sale.buyer}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(sale.date)}
                    </TableCell>
                    <TableCell>{sale.buyer}</TableCell>
                    <TableCell className="text-muted-foreground">{sale.item}</TableCell>
                    <TableCell numeric>{formatEuro(sale.cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </BackofficeShell>
  );
}

function KitColumn({ theme }: { theme: "light" | "dark" }) {
  return (
    <div
      data-theme={theme}
      className="flex flex-col gap-8 rounded-sm bg-background p-5 text-foreground md:p-6"
    >
      <span className="font-mono text-2xs uppercase tracking-label text-muted-foreground">
        {theme === "light" ? "Light — backoffice · marketing" : "Dark — espectador"}
      </span>

      <section className="flex flex-col gap-3">
        <SectionHeader eyebrow="Ação: tinta (inverte em dark)" title="Botões" />
        <div className="flex flex-wrap items-center gap-2.5">
          <Button>Comprar acesso · {formatEuro(750)}</Button>
          <Button variant="secondary">Bilhete físico · {formatEuro(1200)}</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="destructive">Revogar sessão</Button>
          <Button disabled>Esgotado</Button>
          <Button variant="live">
            <PulseDot />
            Ver agora — ao vivo
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader eyebrow="Mono uppercase, raio 4px" title="Badges e estados" />
        <div className="flex flex-wrap items-center gap-2.5">
          <LiveBadge />
          <Badge>Sáb · 21:00</Badge>
          <Badge variant="muted">Esgotado</Badge>
          <Badge variant="accent">Subscritores</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="success">Válido — 1ª entrada</Badge>
          <Badge variant="destructive">Já usado às 21:34</Badge>
          <Badge variant="warning">Outro evento</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader eyebrow="Altura 44px · erro humano" title="Inputs" />
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <Field>
              <FieldLabel htmlFor={`kit-email-${theme}`}>Email</FieldLabel>
              <Input id={`kit-email-${theme}`} type="email" defaultValue="rui.m@gmail.com" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`kit-phone-${theme}`}>Telemóvel (MB WAY)</FieldLabel>
              <Input
                id={`kit-phone-${theme}`}
                type="tel"
                inputMode="numeric"
                defaultValue="91 234 56"
                aria-invalid
                aria-describedby={`kit-phone-error-${theme}`}
                className="font-mono"
              />
              <FieldError id={`kit-phone-error-${theme}`}>
                Confirma o número — faltam dígitos.
              </FieldError>
            </Field>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          eyebrow="Linhas 36px · € em mono à direita"
          title="Tabela compacta"
          action={
            <Button variant="secondary" size="sm">
              Exportar CSV
            </Button>
          }
        />
        <Card>
          <CardContent className="p-4 pt-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Comprador</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead numeric>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SALES.map((sale) => (
                  <TableRow key={sale.buyer}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(sale.date)}
                    </TableCell>
                    <TableCell>{sale.buyer}</TableCell>
                    <TableCell className="text-muted-foreground">{sale.item}</TableCell>
                    <TableCell numeric>{formatEuro(sale.cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader eyebrow="Loading e vazio" title="Skeleton e EmptyState" />
        <Card>
          <CardHeader>
            <CardTitle>Próximo evento</CardTitle>
            <CardDescription>A carregar a agenda do canal…</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="aspect-video w-full" />
          </CardContent>
        </Card>
        <EmptyState
          title="O palco está montado. Falta o evento."
          description="Cria o primeiro: título, data, preço da live — publicas em 2 minutos e o link de venda fica logo pronto."
          action={<Button size="lg">Criar o primeiro evento</Button>}
        />
      </section>
    </div>
  );
}
