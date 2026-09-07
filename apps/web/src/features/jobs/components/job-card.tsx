import { sourceLabels, type Job, type JobStatus } from "backend/contracts";
import { Bookmark, ArchiveX, ArrowUpRight } from "lucide-react";
import { formatDate, formatCompensation } from "@/lib/utils";
import { CompanyMark } from "@/components/ui/company-mark";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { JobLocation } from "./job-location";
interface JobCardProps {
  job: Job;
  selected: boolean;
  onSelect: (job: Job) => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
  isUpdating: boolean;
}
export function JobCard({
  job,
  selected,
  onSelect,
  onStatusChange,
  isUpdating,
}: JobCardProps) {
  const sites = [
    ...new Set(
      job.sourceReferences.map((ref) =>
        new URL(ref.sourceUrl).hostname.replace(/^www\./, ""),
      ),
    ),
  ];
  const current = job.assessmentState === "current";
  const score = job.assessment?.output.score ?? 0;
  const tone =
    job.eligibility.state === "conflicts"
      ? "tone-rose"
      : current && score >= 75
        ? "tone-mint"
        : current
          ? "tone-blue"
          : job.assessmentState === "running" ||
              job.assessmentState === "queued"
            ? "tone-blue"
            : "tone-muted";
  const label =
    job.eligibility.state === "conflicts"
      ? "Constraint conflict"
      : current
        ? score >= 75
          ? "Strong fit"
          : score >= 50
            ? "Possible fit"
            : "Limited fit"
        : (
            {
              "not-assessed": "Not assessed",
              queued: "Queued for analysis",
              running: "Analyzing",
              failed: "Analysis failed",
              stale: "Assessment outdated",
              legacy: "Assessment outdated",
            } as Record<string, string>
          )[job.assessmentState];
  return (
    <article className="job-row" data-selected={selected}>
      <div className="job-identity">
        <CompanyMark name={job.company} className="size-9 text-xs" />
        <div className="min-w-0">
          <h2 className="job-title">
            <Button
              variant="ghost"
              onClick={() => onSelect(job)}
              data-job-id={job.id}
              aria-pressed={selected}
              aria-label={`${job.title} at ${job.company}`}
              className="job-select h-auto justify-start whitespace-normal p-0 text-left font-semibold text-foreground hover:bg-transparent"
            >
              {job.title}
            </Button>
          </h2>
          <div className="job-byline">
            <span className="truncate">{job.company}</span>
            <span aria-hidden="true">·</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="job-source h-auto justify-start p-0 text-xs font-normal hover:bg-transparent"
                >
                  {sourceLabels[job.sources[0]!] ?? "Public listing"}
                  {sites.length > 1 && <span> +{sites.length - 1}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="space-y-2">
                <p className="mb-3 text-sm font-semibold">Listing sources</p>
                {job.sourceReferences.map((ref) => (
                  <a
                    key={ref.id}
                    href={ref.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-md bg-secondary p-3 text-xs text-foreground"
                  >
                    <span className="min-w-0 break-all">
                      {new URL(ref.sourceUrl).hostname}
                    </span>
                    <ArrowUpRight className="size-3 shrink-0" />
                  </a>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
      <div className="job-location">
        <JobLocation job={job} showLabel />
        {job.compensation && (
          <span className="block text-xs text-muted-foreground">
            {formatCompensation(job.compensation)}
          </span>
        )}
      </div>
      <div className="job-assessment">
        <span className={`status-pill ${tone}`}>{label}</span>
      </div>
      <time
        className="job-date"
        dateTime={job.postedAt ?? undefined}
        title={`First discovered ${formatDate(job.firstSeenAt)}`}
      >
        {job.postedAt ? formatDate(job.postedAt) : "Unknown"}
      </time>
      <div className="job-row-actions">
        <Button
          size="icon"
          variant="ghost"
          className={job.status === "saved" ? "size-8 text-brand" : "size-8"}
          disabled={isUpdating}
          aria-label={`${job.status === "saved" ? "Unsave" : "Save"} ${job.title}`}
          title={job.status === "saved" ? "Move to inbox" : "Save job"}
          onClick={() =>
            onStatusChange(job, job.status === "saved" ? "inbox" : "saved")
          }
        >
          <Bookmark className={job.status === "saved" ? "fill-current" : ""} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={isUpdating}
          aria-label={`${job.status === "dismissed" ? "Restore" : "Dismiss"} ${job.title}`}
          title={
            job.status === "dismissed" ? "Restore to inbox" : "Dismiss job"
          }
          onClick={() =>
            onStatusChange(
              job,
              job.status === "dismissed" ? "inbox" : "dismissed",
            )
          }
        >
          <ArchiveX />
        </Button>
      </div>
    </article>
  );
}
