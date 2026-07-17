import { cn } from "@/lib/utils";

// Regra: todo o estado vazio aponta a próxima ação (title curto, description
// com o que fazer, action com o botão/link).
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-input px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      {icon ? <div className="text-foreground [&_svg]:size-8">{icon}</div> : null}
      <h3 className="font-display text-lg font-extrabold">{title}</h3>
      {description ? (
        <p className="max-w-[44ch] text-2sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2 flex flex-col items-center gap-3">{action}</div> : null}
    </div>
  );
}
