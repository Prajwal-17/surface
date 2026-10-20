import { type JobStatus } from "@surface/contracts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, Bookmark, ArchiveX } from "lucide-react";
export function JobStatusTabs({
  value,
  onChange,
  count,
}: {
  value: JobStatus;
  count?: number;
  onChange: (value: JobStatus) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as JobStatus)}>
      <TabsList aria-label="Job status" className="border-0">
        {(
          [
            { value: "inbox", label: "Inbox", icon: Inbox },
            { value: "saved", label: "Saved", icon: Bookmark },
            { value: "dismissed", label: "Dismissed", icon: ArchiveX },
          ] as const
        ).map(({ value: status, label, icon: Icon }) => (
          <TabsTrigger key={status} value={status} className="gap-2">
            <Icon className="size-3.5" />
            {label}
            {status === value && count !== undefined && (
              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-xs leading-none text-brand">
                {count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
