import Image from "next/image";
import type { ChannelDraft } from "@/components/admin/channel-rules";
import { PosterPlaceholder } from "@/components/eventos/poster-placeholder";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LiveBadge } from "@/components/ui/live-badge";
import { TenantScope } from "@/components/ui/tenant-scope";
import { formatEuro } from "@/lib/format";

/*
 * Pré-visualização da página do canal, dentro do backoffice.
 *
 * É a página do espectador em ponto pequeno — mesma moldura, mesma ordem, mesmos
 * componentes base —, porque escolher uma cor a olhar para um quadrado colorido
 * não diz nada a ninguém: o que interessa é ver o nome, a agenda e o botão de
 * compra com aquela cor.
 *
 * Não reutiliza os componentes da página real de propósito: esses pedem um
 * `EventRow` vindo da BD, e inventar uma linha de base de dados só para pintar um
 * cartão sairia pior. O que se reutiliza é o que garante que isto não deriva do
 * design — Card, Badge, LiveBadge, PosterPlaceholder e os variantes de botão.
 *
 * Nada aqui é focável nem clicável: é um retrato, não uma interface. Por isso os
 * "botões" são <span> com o aspeto de botão — quem navega por teclado atravessa
 * o formulário sem tropeçar numa maqueta.
 */

/** Preço só de exemplo. Formatado pelo formatador partilhado, como em todo o lado. */
const EXAMPLE_PRICE_CENTS = 750;

/*
 * Data escrita à mão em vez de formatada: `formatDate` decide mostrar o ano
 * conforme o ano corrente, e uma maqueta que depende do relógio é uma maqueta
 * que pode render diferente no servidor e no browser.
 */
const EXAMPLE_DATE = "sáb 26 jul · 21:00";

export function ChannelPreview({ channel }: { channel: ChannelDraft }) {
  return (
    <TenantScope
      channel={channel}
      surface="dark"
      data-theme="dark"
      role="img"
      aria-label={`Pré-visualização da página do canal ${channel.name} com as cores escolhidas`}
      className="overflow-hidden rounded-sm border border-border bg-background text-foreground select-none"
    >
      {/* Moldura FirstRow: é sempre tinta, não muda com o canal. */}
      <div className="flex h-9 items-center justify-between bg-bar px-3">
        <Image
          src="/brand/firstrow-lockup-h-branco.svg"
          alt=""
          width={66}
          height={16}
          className="h-4 w-auto"
        />
        <span className="font-mono text-2xs tracking-label text-bar-muted uppercase">
          Início · Bilhetes · Conta
        </span>
      </div>

      {/* O filete do canal: uma cor, ou as duas com um corte seco entre elas. */}
      <div aria-hidden className="h-0.75" style={{ background: "var(--tenant-rule)" }} />

      <PosterPlaceholder label="banner" className="h-14 w-full" />

      <div className="px-3">
        <div className="-mt-5 flex items-end gap-2.5 border-b border-border pb-3">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 border-background bg-muted font-display text-2sm font-extrabold text-(--tenant)"
          >
            {channel.logoUrl ? (
              <Image src={channel.logoUrl} alt="" width={44} height={44} />
            ) : (
              channel.initials
            )}
          </span>
          <div className="min-w-0 pb-0.5">
            <p className="truncate font-display text-sm font-extrabold tracking-display">
              {channel.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{channel.tagline}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Hero: é aqui que a cor do canal faz o seu trabalho — a etiqueta. */}
        <div className="rounded-sm border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs font-semibold tracking-label text-(--tenant) uppercase">
              Próxima live
            </span>
            <Badge className="px-1.5 py-0.5 text-2xs">{EXAMPLE_DATE}</Badge>
          </div>
          <p className="mt-1.5 font-display text-sm font-extrabold tracking-display">
            Clash #15 — Regresso às aulas
          </p>
          {/* Dinheiro é da FirstRow: tinta, nunca a cor do canal. */}
          <span
            aria-hidden
            className={buttonVariants({
              variant: "primary",
              size: "sm",
              className: "mt-2.5 w-full",
            })}
          >
            Comprar acesso · {formatEuro(EXAMPLE_PRICE_CENTS)}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-sm bg-(--tenant-soft) px-2.5 py-2">
          <LiveBadge className="px-1.5 py-0.5 text-2xs" />
          <span className="text-xs text-muted-foreground">
            O vermelho do direto não muda com o canal.
          </span>
        </div>
      </div>
    </TenantScope>
  );
}
