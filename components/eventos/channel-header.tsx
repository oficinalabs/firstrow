import Image from "next/image";
import { PosterPlaceholder } from "@/components/eventos/poster-placeholder";
import type { Channel } from "@/lib/channels";

/** Cabeçalho co-branded do canal: banner, logo (ou iniciais) e identidade. */
export function ChannelHeader({ channel }: { channel: Channel }) {
  return (
    <div>
      {/*
       * Banner de BORDO A BORDO (largura toda do ecrã), como o dono pediu.
       *
       * A caixa é 3:1 (`aspect-[3/1]`, o rácio a que o banner é validado — ver
       * image-upload-rules.ts) LIMITADA por `max-h-96`:
       *   • até ~1150px de largura (telemóvel, tablet, portátil) a caixa fica em
       *     3:1 e vê-se o banner INTEIRO, de bordo a bordo;
       *   • acima disso o `max-h-96` trava a altura e o `object-cover` corta o
       *     centro — é o preço inevitável de querer bordo a bordo num ecrã muito
       *     largo (um 3:1 à largura toda de um monitor seria altíssimo).
       * O corte é centrado, por isso o miolo do banner (onde costuma estar o
       * essencial) mantém-se à vista.
       */}
      {channel.bannerUrl ? (
        <div className="relative aspect-[3/1] max-h-96 w-full overflow-hidden">
          <Image
            src={channel.bannerUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : (
        <PosterPlaceholder label="banner do canal" className="aspect-[3/1] max-h-96 w-full" />
      )}
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        {/*
         * O logo SOBE e sobrepõe-se ao fundo do banner (`-mt-7`/`-mt-10`), como o
         * dono pediu. A `border-background` (a cor do fundo da página) desenha um
         * anel à volta do logo que o separa da imagem por baixo.
         */}
        <div className="-mt-7 flex items-end gap-3 border-b pb-4 md:-mt-10 md:gap-5 md:pb-5">
          <div className="flex size-17 shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 border-background bg-muted md:size-24">
            {channel.logoUrl ? (
              <Image src={channel.logoUrl} alt={`Logo ${channel.name}`} width={96} height={96} />
            ) : (
              <span className="font-display text-xl font-extrabold text-muted-foreground md:text-2xl">
                {channel.initials}
              </span>
            )}
          </div>
          <div className="min-w-0 pb-0.5">
            <h1 className="font-display text-2xl font-extrabold tracking-display md:text-3xl">
              {channel.name}
            </h1>
            <p className="mt-0.5 truncate text-2sm text-muted-foreground">{channel.tagline}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
