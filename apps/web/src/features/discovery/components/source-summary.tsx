import {
  sourceKeys,
  sourceLabels,
  type DiscoverySearchResponse,
} from "backend/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Globe2, LoaderCircle, TriangleAlert } from "lucide-react";

interface SourceSummaryProps {
  result?: DiscoverySearchResponse;
  isSearching: boolean;
}

export function SourceSummary({ result, isSearching }: SourceSummaryProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-border px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Globe2 className="size-4 text-brand" />
              Search sources
            </h2>
            {isSearching ? (
              <LoaderCircle className="size-4 animate-spin text-brand" />
            ) : result ? (
              <span className="font-mono text-xs text-muted-foreground">
                {result.run.resultCount} found
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            One search, {sourceKeys.length} job boards.
          </p>
        </div>

        <div>
          {sourceKeys.map((source) => {
            const summary = result?.sources.find(
              (item) => item.source === source,
            );

            return (
              <div
                key={source}
                className="flex min-h-16 items-center justify-between gap-3 border-b border-border/70 px-5 py-3 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-secondary font-mono text-xs text-muted-foreground"
                >
                  {sourceLabels[source].slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {sourceLabels[source]}
                  </p>
                  {isSearching ? (
                    <Skeleton className="mt-1.5 h-2 w-16" />
                  ) : summary ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {summary.status === "success"
                        ? `${summary.acceptedCount} jobs`
                        : summary.error}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Ready to search
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
        <p className="border-t border-border px-5 py-4 text-xs leading-5 text-muted-foreground">
          Save a role to keep it close. Dismiss the rest to clear your inbox.
        </p>
      </CardContent>
    </Card>
  );
}
