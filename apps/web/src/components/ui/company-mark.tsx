import { useState } from "react";
import { cn } from "@/lib/utils";
export function CompanyMark({
  name,
  className,
  src,
  company,
  fallback = "initials",
}: {
  name: string;
  className?: string;
  src?: string | null;
  company?: { id: string; website: string };
  fallback?: "initials" | "none";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const image =
    src ||
    (company?.website
      ? `/api/company-discovery/companies/${encodeURIComponent(company.id)}/favicon`
      : null);
  if (fallback === "none" && (!image || failed === image)) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      {image && failed !== image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full rounded-[inherit] object-contain p-0.5"
          onError={() => setFailed(image)}
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
