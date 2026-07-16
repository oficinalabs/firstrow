// Watermark dinâmica por espectador: o email flutua sobre o vídeo (dissuasor +
// rastreável). Ver docs/SEGURANCA-E-ANTIPIRATARIA.md.
export function Watermark({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      <span className="wm-float absolute whitespace-nowrap text-xs font-medium text-white/40">
        {label}
      </span>
    </div>
  );
}
