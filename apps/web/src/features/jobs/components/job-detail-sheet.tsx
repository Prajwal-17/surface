import { sourceLabels, type Job, type JobStatus } from "backend/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Check, ExternalLink, TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { JobActions } from "./job-actions";
import { JobFitBadge } from "./job-fit-badge";

interface JobDetailSheetProps {
  job: Job | null;
  onClose: () => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
  isUpdating: boolean;
}

export function JobDetailSheet({
  job,
  onClose,
  onStatusChange,
  isUpdating,
}: JobDetailSheetProps) {
  return (
    <Sheet open={Boolean(job)} onOpenChange={(open) => !open && onClose()}>
      {job ? (
        <SheetContent>
          <SheetHeader>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {job.sources.map((source) => (
                <Badge key={source} variant="outline">
                  {sourceLabels[source]}
                </Badge>
              ))}
              {job.isRemote ? <Badge variant="success">Remote</Badge> : null}
            </div>
            <SheetTitle>{job.title}</SheetTitle>
            <SheetDescription>
              {job.company} · {job.location} · {formatDate(job.postedAt)}
              {job.employmentType ? ` · ${job.employmentType}` : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="my-6 min-h-0 flex-1 overflow-y-auto pr-3">
            {job.fit ? (
              <section className="mb-6 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-foreground">
                    Fit analysis
                  </h2>
                  <JobFitBadge fit={job.fit} />
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {job.fit.summary}
                </p>

                {job.fit.strengths.length ? (
                  <div className="mt-4">
                    <h3 className="text-xs font-medium text-foreground">
                      Why it fits
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      {job.fit.strengths.map((strength, index) => (
                        <li
                          key={`${index}-${strength}`}
                          className="flex gap-2 text-xs leading-5 text-muted-foreground"
                        >
                          <Check className="mt-0.5 size-3.5 shrink-0 text-[#a4bea9]" />
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {job.fit.concerns.length ? (
                  <div className="mt-4">
                    <h3 className="text-xs font-medium text-foreground">
                      Things to check
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      {job.fit.concerns.map((concern, index) => (
                        <li
                          key={`${index}-${concern}`}
                          className="flex gap-2 text-xs leading-5 text-muted-foreground"
                        >
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-brand" />
                          {concern}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            <p className="whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
              {job.description || "No description available."}
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <JobActions
              job={job}
              isPending={isUpdating}
              onChange={(status) => onStatusChange(job, status)}
            />
            <Button asChild>
              <a href={job.applyUrl} target="_blank" rel="noreferrer">
                Open original
                <ExternalLink />
              </a>
            </Button>
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
