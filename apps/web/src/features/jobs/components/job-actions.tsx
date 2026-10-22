import type { Job, JobStatus } from "@surface/contracts";
import { Button } from "@/components/ui/button";
import { ArchiveX, Bookmark, Inbox } from "lucide-react";

interface JobActionsProps {
  job: Job;
  onChange: (status: JobStatus) => void;
  isPending: boolean;
  compact?: boolean;
}

export function JobActions({
  job,
  onChange,
  isPending,
  compact = false,
}: JobActionsProps) {
  if (job.status === "dismissed") {
    return (
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "default"}

        disabled={isPending}
        title="Restore to Inbox"
        onClick={() => onChange("inbox")}
      >
        <Inbox />
        <span className={compact ? "sr-only" : undefined}>Restore</span>
      </Button>
    );
  }

  return (
    <div
      className={compact ? "flex items-center gap-0.5" : "flex flex-wrap gap-2"}
    >
      {job.status !== "saved" ? (
        <Button
          type="button"
          variant="secondary"
          size={compact ? "icon" : "default"}

          disabled={isPending}
          title="Save job"
          onClick={() => onChange("saved")}
        >
          <Bookmark />
          <span className={compact ? "sr-only" : undefined}>Save</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "default"}

          disabled={isPending}
          title="Move to Inbox"
          onClick={() => onChange("inbox")}
        >
          <Inbox />
          <span className={compact ? "sr-only" : undefined}>Inbox</span>
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon" : "default"}

        disabled={isPending}
        title="Dismiss job"
        onClick={() => onChange("dismissed")}
      >
        <ArchiveX />
        <span className={compact ? "sr-only" : undefined}>Dismiss</span>
      </Button>
    </div>
  );
}
