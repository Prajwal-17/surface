import { cn } from "@/lib/utils";
const colors = [
  "bg-blue-400/15 text-blue-300 border-blue-400/20",
  "bg-emerald-400/15 text-emerald-300 border-emerald-400/20",
  "bg-amber-400/15 text-amber-200 border-amber-400/20",
  "bg-violet-400/15 text-violet-300 border-violet-400/20",
];
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
        "grid size-10 shrink-0 place-items-center rounded-xl border text-sm font-bold",
        colors[(name.codePointAt(0) ?? 0) % colors.length],
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
