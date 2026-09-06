import { sourceKeys, sourceLabels, type SourceKey } from "@repo/contracts";
import { Input } from "@repo/ui/input";
import { ChevronDown, Search } from "lucide-react";

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
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Filter jobs</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Filter this inbox"
          className="pl-9"
        />
      </label>

      <label className="relative">
        <span className="sr-only">Filter by source</span>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <select
          value={source ?? ""}
          onChange={(event) =>
            onSourceChange(
              (event.target.value || undefined) as SourceKey | undefined,
            )
          }
          className="h-10 min-w-48 appearance-none rounded-[5px] border border-input bg-card px-3 pr-9 text-sm text-foreground outline-none transition-colors hover:border-white/30 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <option value="">All sources</option>
          {sourceKeys.map((key) => (
            <option key={key} value={key}>
              {sourceLabels[key]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
