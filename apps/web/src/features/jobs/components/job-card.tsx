import { sourceLabels, type Job, type JobStatus } from "backend/contracts";
import {
  Bookmark,
  ArchiveX,
  MapPin,
  Globe2,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { formatDate, formatCompensation } from "@/lib/utils";
import { CompanyMark } from "@/components/ui/company-mark";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
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
      <button
        onClick={() => onSelect(job)}
        data-job-id={job.id}
        aria-pressed={selected}
        className="flex w-full min-w-0 items-start gap-3 px-4 pb-2 pt-4 text-left"
      >
        <CompanyMark name={job.company} className="size-9 rounded-lg text-xs" />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {job.company}
          </p>
          <h2 className="break-words text-[14px] font-semibold leading-[1.55] tracking-[-.015em]">
            {job.title}
          </h2>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3 shrink-0" />
              {job.location}
            </span>
            {job.workMode !== "unknown" && (
              <span className="capitalize">{job.workMode}</span>
            )}
          </div>
          {job.compensation && (
            <p className="mt-1.5 text-xs font-semibold text-success">
              {formatCompensation(job.compensation)}
            </p>
          )}
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pl-16">
        <span className={`status-pill ${tone}`}>
          {current && <Sparkles className="size-3" />}
          {label}
        </span>
        <div className="ml-auto flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className={job.status === "saved" ? "size-8 text-brand" : "size-8"}
            disabled={isUpdating}
            aria-label={
              job.status === "saved"
                ? `Unsave ${job.title}`
                : `Save ${job.title}`
            }
            title={job.status === "saved" ? "Move to inbox" : "Save job"}
            onClick={() =>
              onStatusChange(job, job.status === "saved" ? "inbox" : "saved")
            }
          >
            <Bookmark
              className={job.status === "saved" ? "fill-current" : ""}
            />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={isUpdating}
            aria-label={
              job.status === "dismissed"
                ? `Restore ${job.title}`
                : `Dismiss ${job.title}`
            }
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
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 text-xs text-muted-foreground">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1.5 text-xs hover:text-brand">
              <Globe2 className="size-3" />
              {sourceLabels[job.sources[0]!] ?? "Public listing"}
              {sites.length > 1 && (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-brand">
                  +{sites.length - 1} {sites.length === 2 ? "site" : "sites"}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="space-y-2">
            <p className="mb-3 text-sm font-semibold">
              Found on {sites.length || 1}{" "}
              {sites.length === 1 ? "site" : "sites"}
            </p>
            {job.sourceReferences.map((ref) => (
              <a
                key={ref.id}
                href={ref.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg bg-secondary p-3 text-xs text-brand"
              >
                {new URL(ref.sourceUrl).hostname}
                <ArrowUpRight className="size-3 shrink-0" />
              </a>
            ))}
          </PopoverContent>
        </Popover>
        <span title={`First discovered ${formatDate(job.firstSeenAt)}`}>
          {job.postedAt
            ? `Posted ${formatDate(job.postedAt)}`
            : "Posted date unknown"}
        </span>
      </div>
    </article>
  );
}
