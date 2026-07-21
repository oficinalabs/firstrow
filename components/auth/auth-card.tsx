import Image from "next/image";
import Link from "next/link";

/*
 * Cartão único dos 3 ecrãs de auth (entrar/registar/recuperar) — design
 * Espectador.dc.html: coluna única em papel, marca no topo, título display,
 * subtítulo curto. Zero copy-paste entre páginas.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="mb-2 flex flex-col items-center gap-2.5 text-center">
        <Link href="/" aria-label="FirstRow — início" className="alvo-toque">
          <Image src="/brand/firstrow-icon-tinta.svg" alt="" width={40} height={40} priority />
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-display">{title}</h1>
        {subtitle ? (
          <p className="max-w-[32ch] text-2sm leading-relaxed text-foreground-secondary">
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
