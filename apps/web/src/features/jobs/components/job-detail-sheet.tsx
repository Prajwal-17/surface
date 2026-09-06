import { sourceLabels, type Job, type JobStatus } from "@repo/contracts";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/sheet";
import { Building2, CalendarDays, ExternalLink, MapPin } from "lucide-react";
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
            <p className="utility-label text-brand">Role detail</p>
            <SheetTitle>{job.title}</SheetTitle>
            <SheetDescription>
              {job.company} · {job.location}
            </SheetDescription>
          </SheetHeader>

          <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-accent p-4 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2">
              <Building2 className="size-4 text-brand" />
              {job.company}
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="size-4 text-brand" />
              {job.location}
            </p>
            <p className="flex items-center gap-2">
              <CalendarDays className="size-4 text-brand" />
              {formatDate(job.postedAt)}
            </p>
            {job.employmentType ? (
              <p className="text-muted-foreground">{job.employmentType}</p>
            ) : null}
          </div>

          <div className="my-6 min-h-0 flex-1 overflow-y-auto pr-3">
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
              {job.description ||
                "No full description was provided by this source. Open the original posting for complete details."}
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
