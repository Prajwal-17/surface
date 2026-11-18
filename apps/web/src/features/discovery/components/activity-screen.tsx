import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { configuredSourceSchema, runDetailSchema } from "@surface/contracts";
import { ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { LoadingRows } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRefreshPortals, useRefreshStatus } from "../refresh-query";

const states: Record<string, string> = {
  queued: "Waiting",
  running: "Running",
  completed: "Completed",
  partial: "Some sources failed",
  failed: "Failed",
  interrupted: "Interrupted",
};

export function ActivityScreen() {
  const client = useQueryClient();
  const refresh = useRefreshPortals();
  const status = useRefreshStatus();
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: async () =>
      runDetailSchema.array().parse(await apiClient("/api/runs")),
    refetchInterval: (query) =>
      query.state.data?.some(
        (run) => run.state === "queued" || run.state === "running",
      )
        ? 2000
        : 15000,
  });
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () =>
      configuredSourceSchema.array().parse(await apiClient("/api/sources")),
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/runs/${encodeURIComponent(id)}/retry`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: async () => {
      await Promise.all(
        ["refresh", "runs"].map((queryKey) =>
          client.invalidateQueries({ queryKey: [queryKey] }),
        ),
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const names = new Map(
    sources.data?.map((source) => [source.id, source.label]),
  );
  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Portals refresh while Surface is running.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={
              !status.data?.available || status.data.active || refresh.isPending
            }
            onClick={() => refresh.mutate()}
          >
            <RefreshCw /> Refresh now
          </Button>
        </div>
      </header>
      {runs.isPending && <LoadingRows count={4} label="Loading activity" />}
      {runs.error && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          {runs.error.message}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void runs.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      {runs.isSuccess && (
        <section
          className="divide-y divide-border rounded-md border border-border"
          aria-label="Recent runs"
        >
          {runs.data.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              Refresh your sources to see results here.
            </p>
          )}
          {runs.data.map((run) => {
            const failed = run.items.filter(
              (item) =>
                item.error ||
                ["failed", "partial", "interrupted"].includes(item.state),
            );
            const inserted = run.items.reduce(
              (count, item) =>
                count +
                (typeof item.result?.insertedCount === "number"
                  ? item.result.insertedCount
                  : 0),
              0,
            );
            const tone =
              run.state === "completed"
                ? "tone-mint"
                : failed.length
                  ? "tone-amber"
                  : "tone-blue";
            const canRetry = failed.some((item) =>
              ["failed", "partial", "interrupted"].includes(item.state),
            );
            return (
              <article key={run.id} className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">{run.label}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {run.completedAt ? "Finished" : "Requested"}{" "}
                      <time dateTime={run.completedAt ?? run.createdAt}>
                        {new Date(
                          run.completedAt ?? run.createdAt,
                        ).toLocaleString()}
                      </time>
                      {run.kind === "collection" &&
                        ` · ${inserted} new ${inserted === 1 ? "job" : "jobs"}`}
                    </p>
                  </div>
                  <Badge className={tone}>
                    {run.state === "partial" && run.kind !== "collection"
                      ? "Partial"
                      : (states[run.state] ?? run.state)}
                  </Badge>
                </div>
                {failed.length > 0 && (
                  <details className="group mt-2 text-xs">
                    <summary className="flex w-fit cursor-pointer items-center gap-1 rounded-sm text-muted-foreground">
                      <ChevronDown className="size-4 -rotate-90 group-open:rotate-0" />
                      {failed.length}{" "}
                      {failed.length === 1 ? "item needs" : "items need"}{" "}
                      attention
                    </summary>
                    <ul className="my-2 space-y-1 pl-5">
                      {failed.map((item) => (
                        <li key={item.id}>
                          <span className="font-medium">
                            {item.sourceId
                              ? (names.get(item.sourceId) ?? "Source")
                              : "Background task"}
                          </span>{" "}
                          · {item.error ?? states[item.state]}
                        </li>
                      ))}
                    </ul>
                    {canRetry && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(run.id)}
                      >
                        Retry failed items
                      </Button>
                    )}
                  </details>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
