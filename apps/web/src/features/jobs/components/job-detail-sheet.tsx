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
import { ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { JobActions } from "./job-actions";

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
