import { jobStatuses, type JobStatus } from "backend/contracts";

const labels: Record<JobStatus, string> = {
  inbox: "Inbox",
  saved: "Saved",
  dismissed: "Dismissed",
};

interface JobStatusTabsProps {
  value: JobStatus;
  onChange: (value: JobStatus) => void;
}

export function JobStatusTabs({ value, onChange }: JobStatusTabsProps) {
  return (
    <div
      aria-label="Job status"
      className="inline-flex rounded-lg border border-border bg-background p-1"
    >
      {jobStatuses.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={value === status}
          onClick={() => onChange(status)}
          className={
            value === status
              ? "selected-control rounded-md px-3 py-1.5 text-xs text-accent-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
              : "rounded-md px-3 py-1.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
          }
        >
          {labels[status]}
        </button>
      ))}
    </div>
  );
}
