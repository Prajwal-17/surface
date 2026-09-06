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
}: JobListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading jobs">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} />;
  }

  if (!data?.jobs.length) {
    const title = {
      inbox: "A little room for possibility",
      saved: "No saved jobs",
      dismissed: "No dismissed jobs",
    }[status];

    return <EmptyState title={title} />;
  }

  return (
    <>
      <div className="space-y-3">
        {data.jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onSelect={onSelect}
            onStatusChange={onStatusChange}
            isUpdating={updatingJobId === job.id}
          />
        ))}
      </div>

      {data.pages > 1 ? (
        <nav
          aria-label="Job pages"
          className="mt-5 flex items-center justify-between border-t border-border pt-4"
        >
          <p className="font-mono text-[11px] text-muted-foreground">
            Page {data.page} of {data.pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </>
  );
}
