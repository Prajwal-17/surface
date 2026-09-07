"use client";
import { useEffect, useState } from "react";
import {
  jobsListQuerySchema,
  jobSchema,
  type Job,
  type JobStatus,
} from "backend/contracts";
import { AdvancedFilters } from "@/features/jobs/components/advanced-filters";
import { SavedSearches } from "@/features/jobs/components/saved-searches";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, MousePointer2, Layers2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { JobDetailSheet } from "@/features/jobs/components/job-detail-sheet";
import { JobFilters } from "@/features/jobs/components/job-filters";
import { JobList } from "@/features/jobs/components/job-list";
import { JobStatusTabs } from "@/features/jobs/components/job-status-tabs";
import { useJobs } from "@/features/jobs/hooks/use-jobs";
import { useUpdateJobStatus } from "@/features/jobs/hooks/use-update-job-status";
import { apiClient } from "@/lib/api-client";
export function DiscoveryScreen() {
  const params = useSearchParams();
  const [revision, setRevision] = useState<string | null>(null);
  useEffect(() => {
    const events = new EventSource("/api/events");
    const update = (event: MessageEvent) => setRevision(event.data);
    events.addEventListener("revision", update);
    return () => events.close();
  }, []);
  const input = jobsListQuerySchema.safeParse(Object.fromEntries(params));
  const filters = input.success ? input.data : jobsListQuerySchema.parse({});
  const selectedId = params.get("job");
  const jobsQuery = useJobs(filters);
  const mutation = useUpdateJobStatus();
  const selected = useQuery({
    queryKey: ["jobs", "detail", selectedId],
    queryFn: async () =>
      jobSchema.parse(await apiClient(`/api/jobs/${selectedId}`)),
    enabled: Boolean(selectedId),
  });
  function change(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    window.history.replaceState(null, "", `/?${next}`);
  }
  function closeReader() {
    change({ job: undefined });
    const target = selectedId
      ? document.querySelector<HTMLElement>(
          `[data-job-id="${CSS.escape(selectedId)}"]`,
        )
      : null;
    (
      target ?? document.querySelector<HTMLElement>("[data-job-list-heading]")
    )?.focus();
  }
  function statusChange(job: Job, status: JobStatus) {
    mutation.mutate({ id: job.id, status, previousStatus: job.status });
  }
  return (
    <section className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-kicker">Your next chapter</p>
          <h1 data-job-list-heading tabIndex={-1} className="page-heading">
            Opportunities{" "}
            <span className="ml-2 align-middle text-base font-medium tracking-normal text-muted-foreground">
              {jobsQuery.data?.total ?? "—"}
            </span>
          </h1>
          <p className="page-description">
            A little less searching. A clearer view of what fits.
          </p>
        </div>
        <div className="flex gap-2">
          <SavedSearches parameters={params.toString()} />
          <Button asChild>
            <Link href="/companies">
              Add sources <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </div>
      {revision && jobsQuery.data && revision !== jobsQuery.data.revision && (
        <div
          role="status"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-400/25 bg-blue-500/10 px-4 py-2 text-xs text-brand"
        >
          <span className="flex items-center gap-2">
            <RefreshCw className="size-3.5" />
            Updated results are ready. Your current view is kept in place.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-brand"
            onClick={() => void jobsQuery.refetch()}
          >
            Refresh results
          </Button>
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <JobStatusTabs
          value={filters.status}
          onChange={(status) => change({ status, page: "1", job: undefined })}
        />
        <JobFilters
          search={filters.search}
          source={filters.source}
          onSearchChange={(search) => change({ search, page: "1" })}
          onSourceChange={(source) => change({ source, page: "1" })}
        />
        <AdvancedFilters filters={filters} change={change} />
      </div>
      {selectedId && selected.isPending && (
        <p role="status" className="text-xs text-brand min-[1100px]:hidden">
          Opening opportunity…
        </p>
      )}
      <div className="grid min-h-0 flex-1 gap-5 min-[1100px]:grid-cols-[minmax(330px,.85fr)_minmax(0,1.15fr)]">
        <div className="panel min-h-0 min-w-0 overflow-hidden">
          <JobList
            data={jobsQuery.data}
            isLoading={jobsQuery.isPending}
            error={jobsQuery.error}
            status={filters.status}
            page={filters.page}
            onPageChange={(page) => change({ page: String(page) })}
            onSelect={(job) => change({ job: job.id })}
            onStatusChange={statusChange}
            selectedId={selectedId}
            updatingJobId={
              mutation.isPending ? mutation.variables?.id : undefined
            }
          />
        </div>
        <JobDetailSheet
          job={selected.data ?? null}
          onClose={closeReader}
          onStatusChange={statusChange}
          isUpdating={mutation.isPending}
        />
        {!selected.data && (
          <div className="panel hidden min-h-0 items-center justify-center px-8 py-12 min-[1100px]:flex">
            <div className="max-w-xs text-center">
              <div className="relative mx-auto mb-7 grid size-20 place-items-center rounded-3xl border border-blue-400/20 bg-blue-500/10">
                <Layers2 className="size-9 text-brand" />
                <span className="absolute -bottom-2 -right-2 grid size-8 place-items-center rounded-xl border border-border bg-card text-success">
                  <MousePointer2 className="size-4" />
                </span>
              </div>
              <h2 className="text-lg font-semibold tracking-tight">
                {selectedId
                  ? selected.error
                    ? "Unable to open this role"
                    : "Opening opportunity…"
                  : "A closer look starts here"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {selected.error?.message ??
                  (selectedId
                    ? "Loading the role, sources, and assessment."
                    : "Select a role to explore the details, understand the fit, and decide your next step.")}
              </p>
              {selected.error && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => void selected.refetch()}
                >
                  Try again
                </Button>
              )}
            </div>
          </div>
        )}
        {selected.error && (
          <p
            role="alert"
            className="text-sm text-destructive min-[1100px]:hidden"
          >
            {selected.error.message}
          </p>
        )}
      </div>
    </section>
  );
}
