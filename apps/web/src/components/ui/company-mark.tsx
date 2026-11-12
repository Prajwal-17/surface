import { useState } from "react";
import { cn } from "@/lib/utils";
export function CompanyMark({
  name,
  className,
  src,
  fallback = "initials",
}: {
  name: string;
  className?: string;
  src?: string | null;
  fallback?: "initials" | "none";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (fallback === "none" && (!src || failed === src)) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          className="size-full rounded-[inherit] object-contain p-1"
          onError={() => setFailed(src)}
        />
      ) : (
        name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}
