import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

import { TaskRows } from "@/components/ai/task-rows";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  runDetailSchema,
  configuredSourceSchema,
  savedSearchSchema,
} from "@surface/contracts";
import { apiClient } from "@/lib/api-client";
import { CompaniesScreen } from "@/features/companies/components/companies-screen";
import { LoadingRows } from "@/components/feedback/loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  RefreshCw,
  Clock3,
  CircleCheck,
  Globe2,
  CalendarClock,
  HardDrive,
  ChevronDown,
} from "lucide-react";
export function ActivityScreen() {
  const client = useQueryClient();
  const [cleanup, setCleanup] = useState<{
    files: number;
    observations: number;
  } | null>(null);
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: async () =>
      runDetailSchema.array().parse(await apiClient("/api/runs")),
    refetchInterval: (q) =>
      q.state.data?.some((r) => ["queued", "running"].includes(r.state))
        ? 2000
        : false,
  });
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () =>
      configuredSourceSchema.array().parse(await apiClient("/api/sources")),
  });
  const searches = useQuery({
    queryKey: ["saved-searches"],
    queryFn: async () =>
      savedSearchSchema.array().parse(await apiClient("/api/saved-searches")),
  });
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) => apiClient(path, { method, body: JSON.stringify(body ?? {}) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["runs"] });
      await client.invalidateQueries({ queryKey: ["sources"] });
      await client.invalidateQueries({ queryKey: ["saved-searches"] });
      toast.success("Updated");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-4">
      <h1 className="sr-only">Activity</h1>
      <div className="activity-stats">
        {[
          { label: "Recent runs", value: runs.data?.length },
          {
            label: "In progress",
            value: runs.data?.filter((r) =>
              ["running", "queued"].includes(r.state),
            ).length,
          },
          {
            label: "Completed",
            value: runs.data?.filter((r) => r.state === "completed").length,
          },
          {
            label: "Need attention",
            value: runs.data?.filter((r) =>
              ["failed", "partial", "interrupted"].includes(r.state),
            ).length,
          },
        ].map(({ label, value }) => (
          <div key={label} className="activity-stat">
            <p>{label}</p>
            <div className="activity-stat-value">
              {runs.isPending ? (
                <Skeleton className="mt-2 h-7 w-12" />
              ) : (
                (value ?? "—")
              )}
            </div>
          </div>
        ))}
      </div>
      <Tabs defaultValue="runs">
        <div className="section-toolbar">
          <TabsList className="flex flex-wrap">
            {[
              { value: "runs", label: "Run history", icon: Activity },
              { value: "schedules", label: "Schedules", icon: CalendarClock },
              { value: "sources", label: "Sources", icon: Globe2 },
              { value: "storage", label: "Storage", icon: HardDrive },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icon className="size-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            size="sm"
            variant="outline"
            disabled={runs.isFetching}
            onClick={() => void runs.refetch()}
          >
            <RefreshCw
              className={
                runs.isFetching ? "animate-spin motion-reduce:animate-none" : ""
              }
            />
            {runs.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        <TabsContent value="runs">
          <section className="space-y-3">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="section-label">Collection & analysis history</h2>
              <span className="text-xs text-muted-foreground">
                Most recent first
              </span>
            </div>
            {runs.error && <p role="alert">{runs.error.message}</p>}
            {runs.isPending && (
              <LoadingRows label="Loading activity" count={5} />
            )}
            {runs.data?.length === 0 && (
              <div className="panel flex flex-col items-center px-6 py-16 text-center">
                <Clock3 className="mb-4 size-8 text-brand" />
                <h3 className="text-lg font-semibold">
                  Your activity will appear here
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Add a source in Companies or refresh an existing feed. You can
                  follow each collection and assessment here.
                </p>
              </div>
            )}
            <div className="activity-runs">
              {runs.data?.map((run) => (
                <Collapsible key={run.id} className="group activity-run">
                  <CollapsibleTrigger className="flex list-none flex-wrap items-center gap-3">
                    <span
                      className={`grid size-8 place-items-center rounded-md ${run.state === "completed" ? "tone-mint" : ["failed", "partial", "interrupted"].includes(run.state) ? "tone-amber" : "tone-blue"}`}
                    >
                      {run.state === "completed" ? (
                        <CircleCheck className="size-5" />
                      ) : (
                        <Activity className="size-5" />
                      )}
                    </span>
                    <div className="min-w-[160px] flex-1">
                      <h3 className="break-words text-sm font-semibold">
                        {run.label}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString()} ·{" "}
                        {
                          run.items.filter((i) =>
                            [
                              "completed",
                              "partial",
                              "failed",
                              "interrupted",
                            ].includes(i.state),
                          ).length
                        }{" "}
                        of {run.items.length} items finished
                      </p>
                    </div>
                    <span
                      className={`status-pill capitalize ${run.state === "completed" ? "tone-mint" : ["failed", "partial", "interrupted"].includes(run.state) ? "tone-amber" : "tone-blue"}`}
                    >
                      {run.state}
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-3 space-y-3">
                      <TaskRows
                        items={run.items}
                        label={(item) =>
                          sources.data?.find((s) => s.id === item.sourceId)
                            ?.label ??
                          item.jobId ??
                          item.kind
                        }
                      />
                      {run.items.some((i) =>
                        ["failed", "interrupted", "partial"].includes(i.state),
                      ) && (
                        <Button
                          variant="outline"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate({ path: `/api/runs/${run.id}/retry` })
                          }
                        >
                          Retry failed items
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </section>
        </TabsContent>
        <TabsContent value="schedules">
          <section className="form-section space-y-4">
            <h2>
              <CalendarClock />
              Monitoring schedules
            </h2>
            <p className="text-sm text-muted-foreground">
              Recent eligible fetches are shared. Manual refreshes respect
              source limits and backoff. Missed schedules resume once when the
              backend starts.
            </p>
            {sources.isPending && (
              <LoadingRows label="Loading schedules" count={3} />
            )}
            {sources.error && <p role="alert">{sources.error.message}</p>}
            {sources.data?.map((source) => (
              <label
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
              >
                <span>
                  {source.label}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {source.paused
                      ? "Paused"
                      : source.nextDueAt
                        ? `Next: ${new Date(source.nextDueAt).toLocaleString()}`
                        : "Manual only"}
                  </span>
                </span>
                <Select
                  value={String(source.scheduleHours)}
                  disabled={action.isPending}
                  onValueChange={(value) =>
                    action.mutate({
                      path: `/api/sources/${source.id}`,
                      method: "PUT",
                      body: {
                        ...source,
                        scheduleHours: Number(value),
                      },
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={`${source.label} schedule`}
                    className="w-auto min-w-28"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 6, 12, 24].map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h
                          ? h === 24
                            ? "Daily"
                            : `Every ${h} hours`
                          : "Manual only"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ))}
            {searches.data?.map((search) => (
              <div
                key={search.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
              >
                <span>Search: {search.name}</span>
                <Select
                  value={String(search.scheduleHours)}
                  onValueChange={(value) =>
                    action.mutate({
                      path: `/api/saved-searches/${search.id}`,
                      method: "PUT",
                      body: {
                        ...search,
                        scheduleHours: Number(value),
                      },
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={`${search.name} schedule`}
                    className="w-auto min-w-28"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 6, 12, 24].map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h ? `Every ${h} hours` : "Manual only"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() =>
                    action.mutate({
                      path: `/api/saved-searches/${search.id}`,
                      method: "PUT",
                      body: { ...search, paused: !search.paused },
                    })
                  }
                >
                  {search.paused ? "Resume" : "Pause"}
                </Button>
              </div>
            ))}
          </section>
        </TabsContent>
        <TabsContent value="sources">
          <CompaniesScreen sourcesOnly />
        </TabsContent>
        <TabsContent value="storage">
          <section className="form-section max-w-3xl space-y-4">
            <h2>
              <HardDrive />
              Raw snapshot storage
            </h2>
            <p className="text-sm text-muted-foreground">
              Raw files are kept by default. Cleanup keeps the latest content
              for each URL, all run metadata and all job versions. Removed
              evidence stays visibly unavailable.
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  setCleanup(await apiClient("/api/snapshots/cleanup"));
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : "Could not inspect snapshots",
                  );
                }
              }}
            >
              Preview cleanup
            </Button>
            {cleanup && (
              <div className="space-y-3">
                <p>
                  {cleanup.files} superseded files across {cleanup.observations}{" "}
                  snapshot records can be removed.
                </p>
                <Button
                  variant="outline"
                  disabled={action.isPending || !cleanup.files}
                  onClick={() =>
                    action.mutate(
                      {
                        path: "/api/snapshots/cleanup",
                        body: { confirm: true },
                      },
                      { onSuccess: () => setCleanup(null) },
                    )
                  }
                >
                  Delete superseded raw files
                </Button>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
