import { cn } from "@/lib/utils";

// Tabela compacta: linhas 36px, só hairlines (zebra não), cabeçalho mono
// uppercase. Datas e € com `numeric` → mono tabular alinhado à direita.
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-2sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn("[&_tr]:border-b [&_tr]:border-muted [&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-muted/40", className)} {...props} />;
}

type CellProps = { numeric?: boolean };

export function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & CellProps) {
  return (
    <th
      className={cn(
        "h-9 px-2 text-left align-middle font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground first:pl-0 last:pr-0",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & CellProps) {
  return (
    <td
      className={cn(
        "px-2 py-2 align-middle first:pl-0 last:pr-0",
        numeric && "text-right font-mono font-medium tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
