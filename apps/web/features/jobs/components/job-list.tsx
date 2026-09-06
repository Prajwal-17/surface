import type { Job, JobsListResponse, JobStatus } from "@repo/contracts";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
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
      <div className="space-y-2" aria-label="Loading jobs">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} />;
  }

  if (!data?.jobs.length) {
    const content = {
      inbox: {
        title: "Your inbox is clear",
        description:
          "Run a search above to gather fresh jobs from the five connected feeds.",
      },
      saved: {
        title: "No saved jobs yet",
        description:
          "Save promising roles from your inbox and they will stay collected here.",
      },
      dismissed: {
        title: "Nothing dismissed",
        description:
          "Jobs you dismiss move here, where they can always be restored.",
      },
    }[status];

    return <EmptyState {...content} />;
  }

  return (
    <>
      <div className="space-y-2">
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
