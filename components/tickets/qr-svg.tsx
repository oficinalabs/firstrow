import QRCode from "qrcode";

/*
 * QR server-side em SVG puro: desenhamos a matriz de módulos com currentColor,
 * por isso as cores vêm dos tokens do tema (nada de hex) e o SVG chega ao
 * browser já renderizado — funciona em screenshot e offline.
 */
export function QrSvg({ value, className }: { value: string; className?: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;

  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Código QR do bilhete"
      shapeRendering="crispEdges"
      className={className}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
