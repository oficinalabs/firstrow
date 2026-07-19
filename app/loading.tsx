import { EventCardSkeleton } from "@/components/eventos/event-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewerShell } from "@/components/ui/viewer-shell";

const CANAIS = ["c1"];
const PROXIMAS = ["p1", "p2", "p3"];
const ARQUIVO = ["a1", "a2", "a3", "a4"];

// Mesmos blocos e medidas da visão geral (hero, canais, próximas, arquivo).
export default function HomeLoading() {
  return (
    <ViewerShell active="inicio">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 md:px-8">
        <div className="grid gap-8 py-10 md:grid-cols-[1fr_336px] md:items-start md:gap-12 md:py-14">
          <div>
            <Skeleton className="h-9 w-4/5 md:h-10" />
            <Skeleton className="mt-4 h-4 w-full max-w-[48ch]" />
            <Skeleton className="mt-2 h-4 w-3/5 max-w-[48ch]" />
          </div>
          <Skeleton className="h-36" />
        </div>

        <SecaoSkeleton titulo="h-7 w-28">
          {CANAIS.map((slot) => (
            <div key={slot} className="flex items-center gap-4 border-b py-4 md:gap-5">
              <Skeleton className="size-13 shrink-0 md:size-15" />
              <div className="flex-1">
                <Skeleton className="h-4.5 w-40" />
                <Skeleton className="mt-1.5 h-3.5 w-52" />
                <Skeleton className="mt-2 h-3 w-44" />
              </div>
            </div>
          ))}
        </SecaoSkeleton>

        <SecaoSkeleton titulo="h-7 w-44">
          {PROXIMAS.map((slot) => (
            <div key={slot} className="flex items-center gap-4 border-b py-4">
              <Skeleton className="h-10 w-11 shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="mt-2 h-4 w-3/5" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </SecaoSkeleton>

        <SecaoSkeleton titulo="h-7 w-24">
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {ARQUIVO.map((slot) => (
              <EventCardSkeleton key={slot} />
            ))}
          </div>
        </SecaoSkeleton>
      </div>
    </ViewerShell>
  );
}

function SecaoSkeleton({
  titulo,
  children,
}: {
  /** Classes do bloco do título (largura ≈ à do texto real). */
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-12 md:pb-14">
      <div className="border-b-2 border-foreground pb-3">
        <Skeleton className={titulo} />
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
