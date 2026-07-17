import { cn } from "@/lib/utils";

/** Loading: pulsar com os blocos reais do layout (mesmas dimensões). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div aria-hidden className={cn("animate-pulse rounded-sm bg-muted", className)} {...props} />
  );
}
