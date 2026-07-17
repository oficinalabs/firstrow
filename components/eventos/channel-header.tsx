import Image from "next/image";
import { PosterPlaceholder } from "@/components/eventos/poster-placeholder";
import { tenant } from "@/lib/tenant";

/** Cabeçalho co-branded do canal: banner, logo (ou iniciais) e identidade. */
export function ChannelHeader() {
  return (
    <div>
      {tenant.bannerUrl ? (
        <div className="relative h-30 w-full md:h-55">
          <Image src={tenant.bannerUrl} alt="" fill priority className="object-cover" />
        </div>
      ) : (
        <PosterPlaceholder label="banner do canal" className="h-30 w-full md:h-55" />
      )}
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        <div className="-mt-7 flex items-end gap-3 border-b pb-4 md:-mt-10 md:gap-5 md:pb-5">
          <div className="flex size-17 shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 border-background bg-muted md:size-24">
            {tenant.logoUrl ? (
              <Image src={tenant.logoUrl} alt={`Logo ${tenant.name}`} width={96} height={96} />
            ) : (
              <span className="font-display text-xl font-extrabold text-muted-foreground md:text-2xl">
                {tenant.initials}
              </span>
            )}
          </div>
          <div className="min-w-0 pb-0.5">
            <h1 className="font-display text-2xl font-extrabold tracking-display md:text-3xl">
              {tenant.name}
            </h1>
            <p className="mt-0.5 truncate text-2sm text-muted-foreground">{tenant.tagline}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
