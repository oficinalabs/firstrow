import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)} {...props}>
      <div className="flex flex-col gap-1">
        {eyebrow ? (
          <span className="font-mono text-2xs font-medium uppercase tracking-label text-muted-foreground">
            {eyebrow}
          </span>
        ) : null}
        <h2 className="font-display text-xl font-bold tracking-display">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
