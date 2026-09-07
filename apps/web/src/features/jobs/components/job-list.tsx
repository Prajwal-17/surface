import type { Job, JobsListResponse, JobStatus } from "backend/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { JobCard } from "./job-card";

interface JobListProps {
  data?: JobsListResponse;
  isLoading: boolean;
  error: Error | null;
  status: JobStatus;
  page: number;
  onPageChange: (page: number) => void;
  onSelect: (job: Job) => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
  updatingJobId?: string;
  selectedId: string | null;
}

export function JobList({
  data,
  isLoading,
  error,
  status,
  page,
  onPageChange,
  onSelect,
  onStatusChange,
  updatingJobId,
  selectedId,
}: JobListProps) {
  if (isLoading) {
    return (
      <div
        className="min-h-0 flex-1 overflow-hidden"
        role="status"
        aria-label="Loading jobs"
      >
        <span className="sr-only">Loading jobs</span>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="job-row" aria-hidden="true">
            <div className="job-identity">
              <Skeleton className="size-9 shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className={index % 2 ? "h-5 w-2/3" : "h-5 w-4/5"} />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="job-location">
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="job-assessment">
              <Skeleton className="h-6 w-28" />
            </div>
            <div className="job-date">
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="job-row-actions gap-2">
              <Skeleton className="size-7" />
              <Skeleton className="size-7" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && !data) {
    return <ErrorState message={error.message} />;
  }

  if (!data?.jobs.length) {
    const title = {
      inbox: "No jobs match these filters",
      saved: "No saved jobs",
      dismissed: "No dismissed jobs",
    }[status];

    return <EmptyState title={title} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p role="alert" className="border-b px-4 py-3 text-xs text-warning">
          Couldn’t refresh jobs. Showing the previous results.
        </p>
      )}
      <p
        className="shrink-0 border-b px-4 py-2 text-xs text-muted-foreground"
        title="Results reflect your active filters. Collected jobs include every role from your sources."
      >
        {data.total.toLocaleString()} results ·{" "}
        {data.collectedTotal.toLocaleString()} collected
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {data.jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            selected={selectedId === job.id}
            onSelect={onSelect}
            onStatusChange={onStatusChange}
            isUpdating={updatingJobId === job.id}
          />
        ))}
      </div>

      {data.pages > 1 ? (
        <nav
          aria-label="Job pages"
          className="flex shrink-0 items-center justify-between border-t border-border px-4 py-1"
        >
          <p className="text-xs text-muted-foreground">
            {data.total.toLocaleString()} roles · Page {data.page} of{" "}
            {data.pages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              disabled={page >= data.pages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
