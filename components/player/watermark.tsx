import Image from "next/image";

// Watermark dinâmica por espectador: marca + email sobre o vídeo (dissuasor +
// rastreável), mono 13px a 30%, roda de posição a cada 90s (wm-hop em
// globals.css). Ver docs/SEGURANCA-E-ANTIPIRATARIA.md.
export function Watermark({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      <span className="wm-hop absolute inline-flex -rotate-12 items-center gap-1.5 whitespace-nowrap font-mono text-2sm text-bar-foreground/30">
        <Image src="/brand/firstrow-watermark.svg" alt="" width={16} height={16} />
        {label} · FirstRow
      </span>
    </div>
  );
}
