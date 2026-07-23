import Image from "next/image";
import { PosterPlaceholder } from "@/components/eventos/poster-placeholder";
import type { Channel } from "@/lib/channels";

/** Cabeçalho co-branded do canal: banner, logo (ou iniciais) e identidade. */
export function ChannelHeader({ channel }: { channel: Channel }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
      {/*
       * O banner é validado a 3:1 (ver image-upload-rules.ts). Por isso a caixa
       * que o mostra é TAMBÉM 3:1 (`aspect-[3/1]`) — assim o `object-cover` não
       * tem nada para cortar e vê-se o banner INTEIRO. Antes a caixa era de
       * altura fixa e largura total (a larguras de desktop, quase 8:1): o banner
       * era esticado a cobrir e ficava cortado em cima e em baixo.
       *
       * Contido no `max-w-6xl` do resto da página, e não de bordo a bordo: um
       * 3:1 à largura toda do ecrã dava um banner altíssimo. Assim alinha com o
       * conteúdo e mantém uma altura sensata.
       */}
      {channel.bannerUrl ? (
        <div className="relative aspect-[3/1] w-full overflow-hidden rounded-sm">
          <Image
            src={channel.bannerUrl}
            alt=""
            fill
            priority
            sizes="(max-width: 1152px) 100vw, 1120px"
            className="object-cover"
          />
        </div>
      ) : (
        <PosterPlaceholder label="banner do canal" className="aspect-[3/1] w-full rounded-sm" />
      )}
      {/*
       * O logo fica ABAIXO do banner, não sobreposto. O dono não queria o banner
       * por cima do logo — e um logo a straddle-ar a faixa só funciona quando o
       * banner é uma tira fina, não uma imagem 3:1 inteira. `items-center` alinha
       * o logo com as duas linhas do título.
       */}
      <div className="mt-4 flex items-center gap-3 border-b pb-4 md:gap-5 md:pb-5">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted md:size-20">
          {channel.logoUrl ? (
            <Image src={channel.logoUrl} alt={`Logo ${channel.name}`} width={80} height={80} />
          ) : (
            <span className="font-display text-xl font-extrabold text-muted-foreground md:text-2xl">
              {channel.initials}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-display md:text-3xl">
            {channel.name}
          </h1>
          <p className="mt-0.5 truncate text-2sm text-muted-foreground">{channel.tagline}</p>
        </div>
      </div>
    </div>
  );
}
