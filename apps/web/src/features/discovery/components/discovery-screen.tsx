import { useEffect, useState } from "react";
import {
  jobFindResultSchema,
  jobSchema,
  type Job,
  type JobStatus,
  type JobsListQuery,
} from "@surface/contracts";
import { Link } from "react-router";
import { LoaderCircle, Search, Sparkles, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingStatus } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobDetailSheet } from "@/features/jobs/components/job-detail-sheet";
import { JobList } from "@/features/jobs/components/job-list";
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
import { toast } from "sonner";

const portals = [
  "Remotive",
  "Jobicy",
  "Arbeitnow",
  "RemoteOK",
  "We Work Remotely",
] as const;

const statuses = [
  ["inbox", "Inbox"],
  ["saved", "Saved"],
  ["dismissed", "Dismissed"],
] as const;

export function DiscoveryScreen({
  filters,
  selectedId,
  change,
}: {
  filters: JobsListQuery;
  parameters: string;
  selectedId: string | null;
  change: (patch: Record<string, string | undefined>) => void;
}) {
  const client = useQueryClient();
  const [workspaceRef, layout] = useReaderLayout();
  const [query, setQuery] = useState(filters.search ?? "");
  const [location, setLocation] = useState("");
  const [revision, setRevision] = useState<string | null>(null);
  useEffect(() => {
    const events = new EventSource("/api/events");
    const update = (event: MessageEvent) => setRevision(event.data);
    events.addEventListener("revision", update);
    return () => events.close();
  }, []);
  const jobsQuery = useJobs(filters);
  const selected = useQuery({
    queryKey: ["jobs", "detail", selectedId],
    queryFn: async () =>
      jobSchema.parse(await apiClient(`/api/jobs/${selectedId}`)),
    enabled: Boolean(selectedId),
    refetchInterval: (state) =>
      ["queued", "running"].includes(state.state.data?.assessmentState ?? "")
        ? 2000
        : false,
  });
  const track = useTrackJob();
  const find = useMutation({
    mutationFn: async () =>
      jobFindResultSchema.parse(
        await apiClient("/api/jobs/find", {
          method: "POST",
          body: JSON.stringify({ query, location }),
        }),
      ),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["jobs"] });
      change({ search: query || undefined, page: "1", job: undefined });
      const failed = result.portals.filter((portal) => portal.error);
      toast.success(
        result.found
          ? `Found ${result.found.toLocaleString()} jobs · ${result.inserted.toLocaleString()} new`
          : "No jobs matched that search",
      );
      if (failed.length)
        toast.message(
          `${failed.map((portal) => portal.label).join(", ")} could not be read`,
        );
    },
    onError: (error) => toast.error(error.message),
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
      const search =
        document.querySelector<HTMLInputElement>("[data-job-search]");
      if (
        shouldFocusJobSearch(event, isEditableTarget(event.target), overlay) &&
        search
      ) {
        event.preventDefault();
        search.focus();
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

  function statusChange(job: Job, status: JobStatus) {
    track.mutate({
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
        <header className="job-finder">
          <div className="job-finder-heading">
            <div>
              <h1>Find jobs</h1>
              <p>
                Search {portals.length} public portals and keep the roles worth
                reviewing in one list.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/applications">Applications</Link>
            </Button>
          </div>
          <form
            className="job-finder-form"
            onSubmit={(event) => {
              event.preventDefault();
              find.mutate();
            }}
          >
            <Input
              data-job-search
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Role, skill, or company"
              aria-label="Search jobs"
              maxLength={80}
            />
            <Input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Location (optional)"
              aria-label="Location"
              maxLength={80}
            />
            <Button type="submit" disabled={find.isPending}>
              {find.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              {find.isPending ? "Finding…" : "Find jobs"}
            </Button>
          </form>
          <div className="job-portals" aria-label="Job portals">
            {portals.map((portal) => (
              <span key={portal}>{portal}</span>
            ))}
          </div>
        </header>

        <div className="job-finder-toolbar">
          <div className="job-status-tabs" aria-label="Job status">
            {statuses.map(([status, label]) => (
              <Button
                key={status}
                size="sm"
                variant={filters.status === status ? "secondary" : "ghost"}
                aria-pressed={filters.status === status}
                onClick={() =>
                  change({ status: status === "inbox" ? undefined : status, page: "1" })
                }
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="job-filter-search">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              data-job-search
              value={filters.search ?? ""}
              onChange={(event) =>
                change({ search: event.target.value || undefined, page: "1" })
              }
              placeholder="Filter saved jobs"
              aria-label="Filter jobs"
            />
            {filters.search && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => change({ search: undefined, page: "1" })}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <p
            className="inbox-result-count text-xs text-muted-foreground"
            aria-live="polite"
          >
            <span className="font-mono tabular-nums">
              {jobsQuery.data?.total.toLocaleString() ?? "…"}
            </span>{" "}
            saved
            {revision && jobsQuery.isFetching && (
              <LoadingStatus>
                <span className="sr-only">Updating jobs</span>
              </LoadingStatus>
            )}
          </p>
        </div>

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
                track.isPending ? track.variables?.id : undefined
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
          loading={!!selectedId && selected.isLoading}
          onClose={closeReader}
        />
      )}
    </section>
  );
}
