import Link from "next/link";
import { cn } from "@/lib/utils";

// Cabeçalho de página do backoffice: breadcrumb opcional, título Archivo 800,
// badge inline (ex.: NO AR) e meta/ação à direita — igual em todos os ecrãs.
export function PageHeader({
  title,
  badge,
  meta,
  action,
  backHref,
  backLabel,
  className,
}: {
  title: string;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="alvo-toque self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {backLabel} ‹
        </Link>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3.5">
          <h1 className="font-display text-xl font-extrabold tracking-display">{title}</h1>
          {badge}
        </div>
        {meta ? <span className="font-mono text-xs text-muted-foreground">{meta}</span> : null}
        {action ? <div className="flex shrink-0 items-center gap-2.5">{action}</div> : null}
      </div>
    </div>
  );
}
