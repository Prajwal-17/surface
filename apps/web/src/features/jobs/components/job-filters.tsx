import { sourceKeys, sourceLabels, type SourceKey } from "backend/contracts";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface JobFiltersProps {
  search: string;
  source?: SourceKey;
  onSearchChange: (value: string) => void;
  onSourceChange: (value?: SourceKey) => void;
}

export function JobFilters({
  search,
  source,
  onSearchChange,
  onSourceChange,
}: JobFiltersProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
      <label className="relative min-w-[180px] flex-1 sm:max-w-sm">
        <span className="sr-only">Filter jobs</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search roles or companies…"
          className="pl-9"
        />
      </label>

      <Select
        value={source ?? "all"}
        onValueChange={(value) =>
          onSourceChange(value === "all" ? undefined : (value as SourceKey))
        }
      >
        <SelectTrigger
          aria-label="Filter by source"
          className="w-auto min-w-32 border-border bg-card"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {sourceKeys.map((key) => (
            <SelectItem key={key} value={key}>
              {sourceLabels[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
