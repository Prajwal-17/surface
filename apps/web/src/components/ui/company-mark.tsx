import { cn } from "@/lib/utils";
export function CompanyMark({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      {name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
