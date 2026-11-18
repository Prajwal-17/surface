import { sourceLabels, type Job, type JobStatus } from "@surface/contracts";
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
import { useState } from "react";
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
  const [now] = useState(() => Date.now());
  const sites = [
    ...new Set(
      job.sourceReferences.map((ref) =>
        new URL(ref.sourceUrl).hostname.replace(/^www\./, ""),
      ),
    ),
  ];
  const score =
    job.assessmentState === "current"
      ? (job.assessment?.output.score ?? null)
      : null;
  const tone =
    score !== null
      ? score >= 75
        ? "tone-mint"
        : "tone-blue"
      : job.assessmentState === "failed"
        ? "tone-rose"
        : ["queued", "running"].includes(job.assessmentState)
          ? "tone-blue"
          : ["stale", "legacy"].includes(job.assessmentState)
            ? "tone-amber"
            : "tone-muted";
  const label =
    score !== null
      ? score >= 75
        ? "Strong fit"
        : score >= 50
          ? "Possible fit"
          : "Limited fit"
      : {
          "not-assessed": "Not assessed",
          current: "Not assessed",
          queued: "Queued",
          running: "Assessing",
          failed: "Assessment failed",
          stale: "Outdated",
          legacy: "Outdated",
        }[job.assessmentState];
  const eligibility = {
    meets: "Meets constraints",
    clarify: "Clarify eligibility",
    conflicts: "Constraint conflict",
  }[job.eligibility.state];
  const age = job.postedAt
    ? Math.max(
        0,
        Math.floor((now - new Date(job.postedAt).getTime()) / 86400000),
      )
    : null;
  return (
    <article className="job-row" data-selected={selected}>
      <div className="job-identity">
        <CompanyMark name={job.company} className="size-7 text-caption" />
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
            {job.companyWebsite ? (
              <a
                href={job.companyWebsite}
                target="_blank"
                rel="noreferrer"
                className="truncate underline underline-offset-3 hover:text-foreground"
                title={job.companyWebsite}
              >
                {job.company}
              </a>
            ) : (
              <span className="truncate">{job.company}</span>
            )}
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
      </div>
      <div className="job-compensation">
        {job.compensation ? (
          formatCompensation(job.compensation)
        ) : (
          <span className="text-muted-foreground">Not listed</span>
        )}
      </div>
      <div className="job-assessment">
        <span className={`status-pill ${tone}`}>{label}</span>
        {job.assessmentState === "current" &&
          job.assessment?.output.strengths[0] && (
            <span
              className="max-w-full truncate text-caption text-muted-foreground"
              title={job.assessment.output.strengths[0].text}
            >
              {job.assessment.output.strengths[0].text}
            </span>
          )}
        <span
          className={`job-eligibility ${job.eligibility.state === "conflicts" ? "text-destructive" : job.eligibility.state === "meets" ? "text-success" : "text-muted-foreground"}`}
          title={job.eligibility.reasons.join(" · ")}
        >
          {eligibility}
        </span>
      </div>
      <time
        className="job-date"
        dateTime={job.postedAt ?? undefined}
        title={`Posted ${job.postedAt ? formatDate(job.postedAt) : "date unknown"} · First discovered ${formatDate(job.firstSeenAt)}`}
      >
        {age === null ? "Unknown" : age === 0 ? "Today" : `${age}d`}
      </time>
      <div className="job-row-actions">
        {job.status === "saved" ? (
          <Button
            size="icon"
            variant="ghost"
            className="text-brand"
            aria-label={`View tracking for ${job.title}`}
            title="View tracking"
            onClick={() => onSelect(job)}
          >
            <Bookmark className="fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            disabled={isUpdating}
            aria-label={`Add ${job.title} to queue`}
            title="Add to queue"
            onClick={() => onStatusChange(job, "saved")}
          >
            <Bookmark />
          </Button>
        )}
        {job.status === "inbox" && (
          <Button
            size="icon"
            variant="ghost"
            disabled={isUpdating}
            aria-label={`Ignore ${job.title}`}
            title="Ignore"
            onClick={() => onStatusChange(job, "dismissed")}
          >
            <ArchiveX />
          </Button>
        )}
      </div>
    </article>
  );
}
