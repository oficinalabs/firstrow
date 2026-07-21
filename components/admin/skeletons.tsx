import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Skeletons partilhados dos loading.tsx do backoffice — pulsam com os blocos
// reais de cada layout (cabeçalho, fila de StatCards, tabela).

export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-5 w-36" />
    </div>
  );
}

/** A barra de secções de um evento: as abas à esquerda, o scanner à direita. */
export function EventTabsSkeleton() {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <div className="flex gap-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export function StatRowSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-3.5 md:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista estática decorativa
        <Card key={i} className="flex flex-col gap-3 px-4 py-3.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-32" />
        </Card>
      ))}
    </div>
  );
}

export function TableCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lista estática decorativa
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
