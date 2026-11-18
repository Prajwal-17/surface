import { useEffect, useState } from "react";
import {
  jobSchema,
  type Job,
  type JobStatus,
  type JobsListQuery,
} from "@surface/contracts";
import { AdvancedFilters } from "@/features/jobs/components/advanced-filters";
import { SavedSearches } from "@/features/jobs/components/saved-searches";
import { Link } from "react-router";
import { Plus, RefreshCw, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { LoadingStatus } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { JobDetailSheet } from "@/features/jobs/components/job-detail-sheet";
import { JobFilters } from "@/features/jobs/components/job-filters";
import { JobList } from "@/features/jobs/components/job-list";
import { JobStatusTabs } from "@/features/jobs/components/job-status-tabs";
import { useJobs } from "@/features/jobs/hooks/use-jobs";
import { useTrackJob } from "@/features/applications/application-api";
import { apiClient } from "@/lib/api-client";
import { useReaderLayout } from "@/features/jobs/hooks/use-reader-layout";
import {
  hasOpenOverlay,
  isEditableTarget,
  shouldFocusJobSearch,
  shouldCloseJobReader,
} from "@/lib/workspace-keyboard";
import { HeaderActions } from "@/components/layout/header-actions";
import { useJobFilterOptions } from "@/features/jobs/hooks/use-job-filter-options";
import { describeJobFilter } from "@/features/jobs/filter-options";
export function DiscoveryScreen({
  filters,
  parameters,
  selectedId,
  change,
}: {
  filters: JobsListQuery;
  parameters: string;
  selectedId: string | null;
  change: (patch: Record<string, string | undefined>) => void;
}) {
  const [workspaceRef, layout] = useReaderLayout();
  const [revision, setRevision] = useState<string | null>(null);
  useEffect(() => {
    const events = new EventSource("/api/events");
    const update = (event: MessageEvent) => setRevision(event.data);
    events.addEventListener("revision", update);
    return () => events.close();
  }, []);
  const jobsQuery = useJobs(filters);
  const filterOptions = useJobFilterOptions();
  const mutation = useTrackJob();
  const selected = useQuery({
    queryKey: ["jobs", "detail", selectedId],
    queryFn: async () =>
      jobSchema.parse(await apiClient(`/api/jobs/${selectedId}`)),
    enabled: Boolean(selectedId),
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.assessmentState ?? "")
        ? 2000
        : false,
  });
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
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const overlay = hasOpenOverlay();
      if (
        shouldFocusJobSearch(event, isEditableTarget(event.target), overlay)
      ) {
        const search =
          document.querySelector<HTMLInputElement>("[data-job-search]");
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
      if (
        shouldCloseJobReader(event, Boolean(selectedId), layout.split, overlay)
      ) {
        event.preventDefault();
        closeReader();
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  const filterNames: Record<string, string> = {
    source: "Source",
    relevance: "Roles",
    reviewState: "Review",
    companyId: "Company",
    sourceIds: "Source",
    workMode: "Work mode",
    eligibility: "Eligibility",
    assessment: "Assessment",
    availability: "Availability",
    postedAfter: "Posted after",
    discoveredAfter: "Discovered after",
  };
  const activeFilters = Object.entries(filters).filter(
    ([key, value]) =>
      key in filterNames &&
      value !== undefined &&
      value !== "" &&
      !(
        key === "relevance" &&
        value === (filters.status === "inbox" ? "target" : "all")
      ),
  );
  function statusChange(job: Job, status: JobStatus) {
    mutation.mutate({
      id: job.id,
      status: status === "dismissed" ? "ignored" : "queued",
    });
  }
  return (
    <section
      ref={workspaceRef}
      className="discovery-workspace"
      style={{ "--reader-width": `${layout.width}px` } as React.CSSProperties}
      data-split={layout.split && Boolean(selectedId)}
      data-resizing={layout.resizing}
      data-reader-open={Boolean(selectedId)}
    >
      <div id="job-inbox" className="discovery-inbox">
        <h1 data-job-list-heading tabIndex={-1} className="sr-only">
          Jobs
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
          <HeaderActions>
            <span className="inline-flex min-w-5">
              {jobsQuery.isFetching && !jobsQuery.isPending && (
                <LoadingStatus>
                  <span className="sr-only">Updating jobs</span>
                </LoadingStatus>
              )}
            </span>
            <SavedSearches
              parameters={parameters}
              onSelectSearch={(savedFilters) =>
                change({ ...savedFilters, page: "1", job: undefined })
              }
            />
            <Button asChild size="sm">
              <Link to="/companies">
                <Plus /> <span className="max-sm:sr-only">Add sources</span>
              </Link>
            </Button>
          </HeaderActions>
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
          <AdvancedFilters
            filters={filters}
            change={change}
            options={filterOptions}
            resultCount={jobsQuery.data?.total}
            updating={jobsQuery.isFetching}
          />
          <p
            className="inbox-result-count text-xs text-muted-foreground"
            aria-live="polite"
            title={`${jobsQuery.data?.collectedTotal.toLocaleString() ?? "…"} collected jobs across all roles`}
          >
            <span className="font-mono tabular-nums">
              {jobsQuery.data?.total.toLocaleString() ?? "…"}
            </span>{" "}
            results
          </p>
        </div>
        {!!activeFilters.length && (
          <div className="applied-filters" aria-label="Applied filters">
            {activeFilters.map(([key, value]) => {
              const label = describeJobFilter(key, String(value), {
                companies: filterOptions.companies.data,
                sources: filterOptions.sources.data,
              });
              return (
                <Button
                  key={key}
                  size="sm"
                  variant="secondary"
                  className="filter-chip"
                  onClick={() => change({ [key]: undefined, page: "1" })}
                  aria-label={`Remove ${filterNames[key]} filter: ${label}`}
                >
                  <span>
                    {filterNames[key]}: {label}
                  </span>
                  <X className="!size-3" />
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                change(
                  Object.fromEntries([
                    ...activeFilters.map(([key]) => [key, undefined]),
                    ["page", "1"],
                  ]),
                )
              }
            >
              Clear filters
            </Button>
          </div>
        )}
        <div className="inbox-content">
          <div className="job-list-panel">
            <div className="job-columns" aria-hidden="true">
              <span>Role / Company</span>
              <span>Location</span>
              <span>Compensation</span>
              <span>Assessment</span>
              <span>Age</span>
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
      {selectedId && layout.split && (
        <div
          role="separator"
          aria-label="Resize job reader"
          aria-orientation="vertical"
          aria-controls="job-inbox job-reader"
          aria-valuemin={layout.min}
          aria-valuemax={layout.max}
          aria-valuenow={layout.width}
          aria-valuetext={`${layout.width} pixels. Arrow keys resize; Home resets.`}
          tabIndex={0}
          className="reader-divider"
          onPointerDown={layout.onPointerDown}
          onPointerMove={layout.onPointerMove}
          onPointerUp={layout.onPointerUp}
          onPointerCancel={layout.onPointerUp}
          onLostPointerCapture={layout.onLostPointerCapture}
          onKeyDown={layout.onKeyDown}
        />
      )}
      {selectedId && layout.ready && (
        <JobDetailSheet
          key={selectedId}
          split={layout.split}
          error={selected.error}
          onRetry={() => void selected.refetch()}
          job={selected.data ?? null}
          loading={!!selectedId && selected.isPending}
          onClose={closeReader}
        />
      )}
    </section>
  );
}
