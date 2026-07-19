import Image from "next/image";
import Link from "next/link";
import type { ChannelSummary } from "@/components/home/overview";
import { LiveBadge } from "@/components/ui/live-badge";
import { tenantStyle } from "@/components/ui/tenant-scope";
import { channelPath } from "@/lib/channels";

/*
 * Um canal na visão geral: identidade + o que lá há agora. Linha inteira (não
 * grelha de cartões) para que um canal só continue a parecer uma lista e não
 * uma página por preencher — e para aguentar uma dúzia deles sem mudar nada.
 */
export function ChannelRow({ channel, liveNow, upcomingCount, archiveCount }: ChannelSummary) {
  return (
    <Link
      href={channelPath(channel)}
      // A visão geral é do espectador, logo fundo escuro. As iniciais são
      // escritas na cor da liga sobre bg-muted — é por causa deste sítio que o
      // --muted entra no cálculo de contraste (ver backdrops() em lib/colors.ts).
      style={tenantStyle(channel, "dark")}
      className="group flex items-center gap-4 border-b py-4 last:border-b-0 md:gap-5"
    >
      <span
        aria-hidden
        className="flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted font-display text-base font-extrabold text-(--tenant) md:size-15 md:text-lg"
      >
        {channel.logoUrl ? (
          <Image src={channel.logoUrl} alt="" width={60} height={60} />
        ) : (
          channel.initials
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-display text-base font-bold decoration-accent decoration-2 underline-offset-4 group-hover:underline">
            {channel.name}
          </span>
          {liveNow && <LiveBadge />}
        </div>
        <p className="mt-0.5 truncate text-2sm text-muted-foreground">{channel.tagline}</p>
        <p className="mt-1.5 font-mono text-2xs uppercase tracking-label text-muted-foreground">
          {resumo(upcomingCount, archiveCount)}
        </p>
      </div>
      <span aria-hidden className="text-lg text-muted-foreground/60">
        ›
      </span>
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
