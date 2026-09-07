import type { JobFit } from "backend/contracts";
import { Badge } from "@/components/ui/badge";
export function JobFitBadge({
  fit,
  stale = false,
}: {
  fit: JobFit;
  stale?: boolean;
}) {
  return (
    <Badge
      variant={
        stale ? "outline" : fit.verdict === "strong" ? "success" : "outline"
      }
    >
      {stale
        ? "Legacy assessment · stale"
        : {
            strong: "Recommended to review",
            possible: "Possible fit",
            weak: "Limited fit",
          }[fit.verdict]}
    </Badge>
  );
}
