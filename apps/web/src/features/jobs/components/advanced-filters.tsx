import { SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  companySchema,
  configuredSourceSchema,
  type JobsListQuery,
} from "backend/contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
export function AdvancedFilters({
  filters,
  change,
}: {
  filters: JobsListQuery;
  change: (patch: Record<string, string | undefined>) => void;
}) {
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: async () =>
      companySchema.array().parse(await apiClient("/api/companies")),
  });
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () =>
      configuredSourceSchema.array().parse(await apiClient("/api/sources")),
  });
  const select = (
    label: string,
    key: keyof JobsListQuery,
    options: [string, string][],
  ) => (
    <label className="grid gap-2 text-sm">
      {label}
      <Select
        value={String(filters[key] ?? "all")}
        onValueChange={(value) =>
          change({ [key]: value === "all" ? undefined : value, page: "1" })
        }
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map(([value, text]) => (
            <SelectItem key={value} value={value}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
  return (
    <>
      <Select
        value={filters.sort}
        onValueChange={(value) => change({ sort: value, page: "1" })}
      >
        <SelectTrigger aria-label="Sort jobs" className="w-auto min-w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="best-fit">Best fit</SelectItem>
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontal />
            Filters
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="max-h-[70svh] space-y-4 overflow-y-auto">
            <h2 className="font-semibold">Filter jobs</h2>
            {select("Review state", "reviewState", [
              ["unreviewed", "Unreviewed"],
              ["reviewed", "Reviewed"],
            ])}
            {select(
              "Company",
              "companyId",
              (companies.data ?? []).map((c) => [c.id, c.name]),
            )}
            {select(
              "Configured source",
              "sourceIds",
              (sources.data ?? []).map((s) => [s.id, s.label]),
            )}
            {select("Work mode", "workMode", [
              ["remote", "Remote"],
              ["hybrid", "Hybrid"],
              ["onsite", "On-site"],
              ["unknown", "Unknown"],
            ])}
            {select("Eligibility", "eligibility", [
              ["meets", "Meets stated constraints"],
              ["clarify", "Needs clarification"],
              ["conflicts", "Conflicts with constraints"],
            ])}
            {select(
              "Assessment",
              "assessment",
              [
                "not-assessed",
                "queued",
                "running",
                "failed",
                "current",
                "stale",
                "legacy",
              ].map((v) => [v, v.replaceAll("-", " ")]),
            )}
            {select("Availability", "availability", [
              ["open", "Observed open"],
              ["possibly-closed", "Possibly closed / unknown"],
              ["closed", "Closed"],
            ])}
            <label className="grid gap-2 text-sm">
              Posted on or after
              <Input
                type="date"
                value={filters.postedAfter ?? ""}
                onChange={(e) =>
                  change({
                    postedAfter: e.target.value || undefined,
                    page: "1",
                  })
                }
              />
            </label>
            <label className="grid gap-2 text-sm">
              First discovered on or after
              <Input
                type="date"
                value={filters.discoveredAfter ?? ""}
                onChange={(e) =>
                  change({
                    discoveredAfter: e.target.value || undefined,
                    page: "1",
                  })
                }
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Unknown posted dates are excluded only when a posted-date filter
              is set.
            </p>
            <Button
              variant="ghost"
              onClick={() =>
                change({
                  reviewState: undefined,
                  companyId: undefined,
                  sourceIds: undefined,
                  workMode: undefined,
                  eligibility: undefined,
                  assessment: undefined,
                  availability: undefined,
                  postedAfter: undefined,
                  discoveredAfter: undefined,
                  page: "1",
                })
              }
            >
              Clear advanced filters
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
