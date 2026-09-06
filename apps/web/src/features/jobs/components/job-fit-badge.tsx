import type { JobFit } from "backend/contracts";
import { Badge } from "@/components/ui/badge";

const labels: Record<JobFit["verdict"], string> = {
  strong: "Strong fit",
  possible: "Possible fit",
  weak: "Weak fit",
};

export function JobFitBadge({ fit }: { fit: JobFit }) {
  return (
    <Badge
      variant={fit.verdict === "strong" ? "success" : "outline"}
      className={
        fit.verdict === "possible"
          ? "border-accent-border bg-accent text-accent-foreground"
          : undefined
      }
    >
      {fit.score} · {labels[fit.verdict]}
    </Badge>
  );
}
