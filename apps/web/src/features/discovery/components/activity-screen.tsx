"use client";
import { TaskRows } from "@/components/ai/task-rows";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  runDetailSchema,
  configuredSourceSchema,
  savedSearchSchema,
} from "backend/contracts";
import { apiClient } from "@/lib/api-client";
import { CompaniesScreen } from "@/features/companies/components/companies-screen";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  RefreshCw,
  Clock3,
  CircleCheck,
  TriangleAlert,
  Globe2,
  CalendarClock,
  HardDrive,
  ChevronDown,
  Radio,
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
    <div className="mx-auto max-w-7xl space-y-6 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-kicker">Behind your inbox</p>
          <h1 className="page-heading">Activity</h1>
          <p className="page-description">
            See what's collecting, what's ready, and what needs attention.
          </p>
        </div>
        <Button variant="outline" onClick={() => void runs.refetch()}>
          <RefreshCw />
          Refresh
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Recent runs",
            value: runs.data?.length,
            icon: Activity,
            tone: "tone-blue",
          },
          {
            label: "In progress",
            value: runs.data?.filter((r) =>
              ["running", "queued"].includes(r.state),
            ).length,
            icon: Radio,
            tone: "tone-blue",
          },
          {
            label: "Completed",
            value: runs.data?.filter((r) => r.state === "completed").length,
            icon: CircleCheck,
            tone: "tone-mint",
          },
          {
            label: "Need attention",
            value: runs.data?.filter((r) =>
              ["failed", "partial", "interrupted"].includes(r.state),
            ).length,
            icon: TriangleAlert,
            tone: "tone-amber",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="panel flex items-center gap-4 p-4">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}
            >
              <Icon className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-bold tracking-tight">
                {value ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>
      <Tabs defaultValue="runs">
        <TabsList className="mb-5 flex h-auto w-fit flex-wrap justify-start gap-1">
          {[
            { value: "runs", label: "Run history", icon: Activity },
            { value: "schedules", label: "Schedules", icon: CalendarClock },
            { value: "sources", label: "Sources", icon: Globe2 },
            { value: "storage", label: "Storage", icon: HardDrive },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-9 gap-2 text-xs"
            >
              <Icon className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="runs">
          <section className="space-y-3">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="section-label">Collection & analysis history</h2>
              <span className="text-xs text-muted-foreground">
                Most recent first
              </span>
            </div>
            {runs.error && <p role="alert">{runs.error.message}</p>}
            {runs.isPending && <p role="status">Loading activity…</p>}
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
            {runs.data?.map((run) => (
              <details key={run.id} className="group panel p-4">
                <summary className="flex list-none flex-wrap items-center gap-3">
                  <span
                    className={`grid size-10 place-items-center rounded-xl ${run.state === "completed" ? "tone-mint" : ["failed", "partial", "interrupted"].includes(run.state) ? "tone-amber" : "tone-blue"}`}
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
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
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
              </details>
            ))}
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
                  aria-label={`${source.label} schedule`}
                  value={source.scheduleHours}
                  disabled={action.isPending}
                  onChange={(e) =>
                    action.mutate({
                      path: `/api/sources/${source.id}`,
                      method: "PUT",
                      body: {
                        ...source,
                        scheduleHours: Number(e.target.value),
                      },
                    })
                  }
                >
                  {[0, 6, 12, 24].map((h) => (
                    <option key={h} value={h}>
                      {h
                        ? h === 24
                          ? "Daily"
                          : `Every ${h} hours`
                        : "Manual only"}
                    </option>
                  ))}
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
                  aria-label={`${search.name} schedule`}
                  value={search.scheduleHours}
                  onChange={(e) =>
                    action.mutate({
                      path: `/api/saved-searches/${search.id}`,
                      method: "PUT",
                      body: {
                        ...search,
                        scheduleHours: Number(e.target.value),
                      },
                    })
                  }
                >
                  {[0, 6, 12, 24].map((h) => (
                    <option key={h} value={h}>
                      {h ? `Every ${h} hours` : "Manual only"}
                    </option>
                  ))}
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
