import { sourceLabels, type Job, type JobStatus } from "backend/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { JobActions } from "./job-actions";
import { JobFitBadge } from "./job-fit-badge";

interface JobCardProps {
  job: Job;
  onSelect: (job: Job) => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
  isUpdating: boolean;
}

export function JobCard({
  job,
  onSelect,
  onStatusChange,
  isUpdating,
}: JobCardProps) {
  return (
    <Card className="group overflow-hidden transition-colors hover:border-border-strong">
      <CardContent className="grid gap-0 p-0 sm:grid-cols-[minmax(0,1fr)_auto]">
        <button
          type="button"
          onClick={() => onSelect(job)}
          className="min-w-0 p-4 text-left outline-none transition-colors hover:bg-secondary/25 focus-visible:bg-secondary/35 focus-visible:shadow-[inset_3px_0_0_var(--ring)] sm:p-5"
          aria-label={`Open details for ${job.title} at ${job.company}`}
        >
          <div className="mb-4 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-sm font-medium text-brand"
            >
              {job.company.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {job.company}
            </span>
          </div>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.07em] text-muted-foreground">
              {job.sources.map((source) => sourceLabels[source]).join(" + ")}
            </span>
            {job.isRemote ? <Badge variant="success">Remote</Badge> : null}
            {job.employmentType ? (
              <Badge variant="outline">{job.employmentType}</Badge>
            ) : null}
            {job.fit ? <JobFitBadge fit={job.fit} /> : null}
          </div>

          <h3 className="text-[1.12rem] font-medium leading-[1.25] tracking-[-0.02em] text-foreground transition-colors group-hover:text-brand sm:text-[1.2rem]">
            {job.title}
          </h3>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
            <p className="flex items-center gap-2">
              <MapPin className="size-3.5" />
              <span>{job.location}</span>
            </p>
            <p className="flex items-center gap-2">
              <CalendarDays className="size-3.5" />
              {formatDate(job.postedAt)}
            </p>
          </div>
        </button>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:w-36 sm:flex-col sm:items-stretch sm:justify-center sm:border-t-0 sm:border-l sm:border-border/60 sm:bg-background/25 sm:px-3">
          <JobActions
            job={job}
            compact
            isPending={isUpdating}
            onChange={(status) => onStatusChange(job, status)}
          />
          <button
            type="button"
            onClick={() => onSelect(job)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
          >
            Details
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
