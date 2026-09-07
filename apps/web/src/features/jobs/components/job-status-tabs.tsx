import { type JobStatus } from "backend/contracts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, Bookmark, ArchiveX } from "lucide-react";
export function JobStatusTabs({
  value,
  onChange,
}: {
  value: JobStatus;
  onChange: (value: JobStatus) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as JobStatus)}>
      <TabsList aria-label="Job status" className="h-10 bg-secondary/60 p-1">
        {(
          [
            { value: "inbox", label: "Inbox", icon: Inbox },
            { value: "saved", label: "Saved", icon: Bookmark },
            { value: "dismissed", label: "Dismissed", icon: ArchiveX },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="gap-2 rounded-md px-3 text-xs data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
          >
            <Icon className="size-3.5" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
