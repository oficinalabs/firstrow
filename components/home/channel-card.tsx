import Image from "next/image";
import Link from "next/link";
import type { ChannelSummary } from "@/components/home/overview";
import { LiveBadge } from "@/components/ui/live-badge";
import { tenantStyle } from "@/components/ui/tenant-scope";
import { channelPath } from "@/lib/channels";

/*
 * Um canal na galeria da home: um cartão com a imagem quadrada em cima — o logo
 * do canal, ou as iniciais na cor da liga enquanto não houver logo (o upload
 * existe desde a Onda B2) — e nome + tagline por baixo. Substituiu a linha
 * horizontal (`ChannelRow`): o dono pediu uma montra de quadrados.
 *
 * Aguenta uma dúzia de canais na mesma — quem muda de colunas é a grelha
 * (`app/page.tsx`); o cartão é sempre igual. E com um canal só continua a
 * ler-se como uma plataforma a começar, não como uma página vazia.
 *
 * A cor `--tenant` (co-branding) sai da paleta do canal derivada para o fundo
 * escuro do espectador: pinta as iniciais e o realce da borda ao passar o rato.
 * O resto é neutro do tema — dinheiro e ações continuam a ser da FirstRow, não
 * do canal (ver lib/colors.ts).
 */
export function ChannelCard({ channel, liveNow, upcomingCount, archiveCount }: ChannelSummary) {
  return (
    <Link
      href={channelPath(channel)}
      style={tenantStyle(channel, "dark")}
      // `rounded-md` = raio único de 6px (token). A borda passa à cor da liga só
      // no hover — em repouso é a hairline neutra, para a grelha não parecer um
      // mostruário de cores.
      className="group flex flex-col overflow-hidden rounded-md border bg-card transition-colors hover:border-(--tenant)"
    >
      <span
        aria-hidden
        // Quadrado (`aspect-square`): é o que faz a "montra". `relative` para o
        // logo o poder preencher com `fill`; as iniciais ficam centradas por
        // baixo quando não há logo.
        className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted font-display text-3xl font-extrabold text-(--tenant)"
      >
        {channel.logoUrl ? (
          <Image
            src={channel.logoUrl}
            alt=""
            fill
            // Uma coluna abaixo de 640px, duas até 1024px, três acima — o mesmo
            // que a grelha faz, para o browser não descarregar imagem a mais.
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          channel.initials
        )}
        {/* AO VIVO como selo no canto da imagem — mais visível numa montra do que
            encostado ao nome, e o vermelho live é só para direto. */}
        {liveNow && <LiveBadge className="absolute left-2.5 top-2.5" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <span className="font-display text-base font-bold decoration-accent decoration-2 underline-offset-4 group-hover:underline">
          {channel.name}
        </span>
        <p className="mt-1 line-clamp-2 text-2sm text-muted-foreground">{channel.tagline}</p>
        {/* `mt-auto` cola a meta ao fundo: cartões com taglines de tamanhos
            diferentes alinham a última linha na grelha. */}
        <p className="mt-auto pt-3 font-mono text-2xs uppercase tracking-label text-muted-foreground">
          {resumo(upcomingCount, archiveCount)}
        </p>
      </div>
    </Link>
  );
}

/** "1 live marcada · arquivo a estrear" — sem números inventados nem zeros secos. */
function resumo(upcomingCount: number, archiveCount: number): string {
  const lives =
    upcomingCount === 0
      ? "sem datas marcadas"
      : upcomingCount === 1
        ? "1 live marcada"
        : `${upcomingCount} lives marcadas`;
  const arquivo =
    archiveCount === 0
      ? "arquivo a estrear"
      : archiveCount === 1
        ? "1 replay no arquivo"
        : `${archiveCount} replays no arquivo`;
  return `${lives} · ${arquivo}`;
}
