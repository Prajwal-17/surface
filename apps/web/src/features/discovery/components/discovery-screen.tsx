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
import { Plus, RefreshCw } from "lucide-react";
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
    <section
      className="discovery-workspace"
      data-reader-open={Boolean(selectedId)}
    >
      <div className="discovery-inbox">
        <h1 data-job-list-heading tabIndex={-1} className="sr-only">
          Opportunities
        </h1>
        <div className="inbox-header">
          <div className="inbox-status">
            <JobStatusTabs
              value={filters.status}
              count={jobsQuery.data?.total}
              onChange={(status) =>
                change({ status, page: "1", job: undefined })
              }
            />
          </div>
          <div className="inbox-header-actions">
            <SavedSearches parameters={params.toString()} />
            <Button asChild size="sm">
              <Link href="/companies">
                <Plus /> <span className="max-sm:sr-only">Add sources</span>
              </Link>
            </Button>
          </div>
        </div>
        {revision && jobsQuery.data && revision !== jobsQuery.data.revision && (
          <div
            role="status"
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs text-brand"
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
        <div className="inbox-toolbar">
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
        <div className="inbox-content">
          <div className="job-list-panel">
            <div className="job-columns" aria-hidden="true">
              <span>Role / Company</span>
              <span>Location</span>
              <span>Assessment</span>
              <span>Posted</span>
              <span />
            </div>
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
        </div>
      </div>
      <JobDetailSheet
        job={selected.data ?? null}
        onClose={closeReader}
        onStatusChange={statusChange}
        isUpdating={mutation.isPending}
      />
      {selectedId && !selected.data && (
        <div
          className="reader-placeholder"
          role={selected.error ? "alert" : "status"}
        >
          <p>
            {selected.error
              ? "Unable to open this role"
              : "Opening opportunity…"}
          </p>
          {selected.error && (
            <>
              <p className="text-sm text-muted-foreground">
                {selected.error.message}
              </p>
              <Button variant="outline" onClick={() => void selected.refetch()}>
                Try again
              </Button>
              <Button variant="ghost" onClick={closeReader}>
                Close reader
              </Button>
            </>
          )}
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
    </section>
  );
}
