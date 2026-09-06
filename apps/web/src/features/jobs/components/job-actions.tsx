import type { Job, JobStatus } from "@repo/contracts";
import { Button } from "@repo/ui/button";
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
        size={compact ? "sm" : "default"}
        disabled={isPending}
        onClick={() => onChange("inbox")}
      >
        <Inbox />
        Restore
      </Button>
    );
  }

  return (
    <div
      className={
        compact
          ? "grid grid-cols-2 gap-1.5 sm:grid-cols-1"
          : "flex flex-wrap gap-2"
      }
    >
      {job.status !== "saved" ? (
        <Button
          type="button"
          variant="secondary"
          size={compact ? "sm" : "default"}
          disabled={isPending}
          onClick={() => onChange("saved")}
        >
          <Bookmark />
          Save
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          disabled={isPending}
          onClick={() => onChange("inbox")}
        >
          <Inbox />
          Inbox
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size={compact ? "sm" : "default"}
        disabled={isPending}
        onClick={() => onChange("dismissed")}
      >
        <ArchiveX />
        Dismiss
      </Button>
    </div>
  );
}
