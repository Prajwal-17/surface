import {
  sourceKeys,
  sourceLabels,
  type DiscoverySearchResponse,
} from "@repo/contracts";
import { Badge } from "@repo/ui/badge";
import { Card, CardContent } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";

interface SourceSummaryProps {
  result?: DiscoverySearchResponse;
  isSearching: boolean;
}

export function SourceSummary({ result, isSearching }: SourceSummaryProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-border bg-accent/65 px-4 py-4">
          <p className="utility-label text-accent-foreground/70">
            Source check
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <h2 className="text-lg font-normal tracking-[-0.02em]">
              Feed report
            </h2>
            {isSearching ? (
              <LoaderCircle className="mb-0.5 size-4 animate-spin text-brand" />
            ) : result ? (
              <span className="font-mono text-xs text-accent-foreground/70">
                {result.run.resultCount} found
              </span>
            ) : (
              <span className="font-mono text-xs text-accent-foreground/70">
                ready
              </span>
            )}
          </div>
        </div>

        <div>
          {sourceKeys.map((source) => {
            const summary = result?.sources.find(
              (item) => item.source === source,
            );

            return (
              <div
                key={source}
                className="flex min-h-14 items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {sourceLabels[source]}
                  </p>
                  {isSearching ? (
                    <Skeleton className="mt-1.5 h-2 w-16" />
                  ) : summary ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {summary.status === "success"
                        ? `${summary.acceptedCount} accepted · ${summary.durationMs}ms`
                        : summary.error}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Standing by
                    </p>
                  )}
                </div>

                {summary?.status === "success" ? (
                  <Badge
                    variant="success"
                    className="size-6 justify-center p-0"
                    aria-label="Source completed"
                  >
                    <Check className="size-3" />
                  </Badge>
                ) : summary?.status === "failed" ? (
                  <Badge
                    variant="danger"
                    className="size-6 justify-center p-0"
                    aria-label="Source failed"
                  >
                    <TriangleAlert className="size-3" />
                  </Badge>
                ) : (
                  <span
                    aria-hidden="true"
                    className={
                      isSearching
                        ? "size-1.5 animate-pulse rounded-full bg-brand"
                        : "size-1.5 rounded-full bg-muted-foreground/45"
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="border-t border-border bg-secondary/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
          Each feed runs independently, so one failure will not block the rest.
        </p>
      </CardContent>
    </Card>
  );
}
