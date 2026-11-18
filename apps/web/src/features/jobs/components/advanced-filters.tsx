import { useId, useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { defaultJobRelevance, type JobsListQuery } from "@surface/contracts";
import { Button } from "@/components/ui/button";
import { ChoiceGroup, type ChoiceOption } from "@/components/ui/choice-group";
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
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { LoadingStatus } from "@/components/feedback/loading-state";
import { useIsMobile } from "@/hooks/use-mobile";
import type { useJobFilterOptions } from "../hooks/use-job-filter-options";
import {
  reviewChoices,
  workModeChoices,
  eligibilityOptions,
  assessmentOptions,
  availabilityOptions,
  advancedFilterCount,
  resetAdvancedFilters,
} from "../filter-options";

function FilterSelect({
  label,
  value,
  options,
  anyLabel,
  onValueChange,
  loading = false,
  failed = false,
  onRetry,
  emptyMessage,
}: {
  label: string;
  value?: string;
  options: readonly ChoiceOption[];
  anyLabel: string;
  onValueChange: (value: string) => void;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
}) {
  const id = useId();
  const missingValue =
    value && !options.some((option) => option.value === value);
  return (
    <div className="job-filter-field">
      <label htmlFor={id}>{label}</label>
      <Select value={value || "all"} onValueChange={onValueChange}>
        <SelectTrigger
          id={id}
          disabled={loading}
          aria-busy={loading || undefined}
          aria-describedby={failed ? id + "-error" : undefined}
        >
          {loading ? (
            <span className="text-muted-foreground">Loading…</span>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent className="max-w-[min(420px,calc(100vw-24px))] [&_[data-slot=select-item]>span:last-child]:min-w-0 [&_[data-slot=select-item]>span:last-child]:break-words [&_[data-slot=select-item]>span:last-child]:whitespace-normal">
          <SelectItem value="all">{anyLabel}</SelectItem>
          {missingValue && (
            <SelectItem value={value}>
              {value.includes(",")
                ? value.split(",").filter(Boolean).length + " selected sources"
                : "Selected value (unavailable)"}
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {failed && (
        <p id={id + "-error"} role="alert" className="text-xs text-destructive">
          Couldn’t load options.{" "}
          <Button
            size="sm"
            variant="ghost"
            className="underline underline-offset-2"
            onClick={onRetry}
          >
            Retry
          </Button>
        </p>
      )}
      {!loading && !failed && !options.length && emptyMessage && (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  );
}

export function AdvancedFilters({
  filters,
  change,
  options,
  resultCount,
  updating = false,
}: {
  filters: JobsListQuery;
  change: (patch: Record<string, string | undefined>) => void;
  options: ReturnType<typeof useJobFilterOptions>;
  resultCount?: number;
  updating?: boolean;
}) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const id = useId();
  const count = advancedFilterCount(filters);
  const { companies, sources } = options;
  const dateCount =
    Number(Boolean(filters.postedAfter)) +
    Number(Boolean(filters.discoveredAfter));
  const update = (key: keyof JobsListQuery, value: string) =>
    change({ [key]: value === "all" ? undefined : value, page: "1" });
  const trigger = (
    <Button
      variant="outline"
      className={
        count ? "border-link/50 bg-info-background text-link" : undefined
      }
      aria-label={count ? "Filters (" + count + " active)" : "Filters"}
    >
      <SlidersHorizontal /> Filters
      {count > 0 && (
        <span
          aria-hidden="true"
          className="grid min-w-5 place-items-center rounded bg-link/15 px-1 font-mono text-xs"
        >
          {count}
        </span>
      )}
    </Button>
  );
  const content = (
    <div className="job-filter-panel" data-job-filter-panel>
      <header className="job-filter-header">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {mobile ? (
            <SheetTitle className="text-base">Filters</SheetTitle>
          ) : (
            <h2 id={id + "-title"} className="text-base font-semibold">
              Filters
            </h2>
          )}
          {count > 0 && (
            <span className="text-xs text-muted-foreground">
              {count} active
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={!count}
          onClick={() => change(resetAdvancedFilters())}
          aria-label="Reset advanced filters"
        >
          <RotateCcw className="!size-3.5" /> Reset
        </Button>
        {!mobile && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
          >
            <X />
          </Button>
        )}
      </header>
      {mobile ? (
        <SheetDescription className="sr-only">
          Refine your job list. Results update as you choose filters.
        </SheetDescription>
      ) : (
        <p id={id + "-description"} className="sr-only">
          Refine your job list. Results update as you choose filters.
        </p>
      )}
      <div className="job-filter-body">
        <section
          className="job-filter-section"
          aria-labelledby={id + "-review"}
        >
          <h3 id={id + "-review"}>Review & fit</h3>
          <ChoiceGroup
            label="Review state"
            value={filters.reviewState || "all"}
            options={reviewChoices}
            onValueChange={(value) => update("reviewState", value)}
          />
          <FilterSelect
            label="Assessment"
            value={filters.assessment}
            anyLabel="Any assessment"
            options={assessmentOptions}
            onValueChange={(value) => update("assessment", value)}
          />
          <FilterSelect
            label="Eligibility"
            value={filters.eligibility}
            anyLabel="Any eligibility"
            options={eligibilityOptions}
            onValueChange={(value) => update("eligibility", value)}
          />
        </section>
        <section
          className="job-filter-section"
          aria-labelledby={id + "-workplace"}
        >
          <h3 id={id + "-workplace"}>Workplace</h3>
          <ChoiceGroup
            label="Work mode"
            value={filters.workMode || "all"}
            options={workModeChoices}
            onValueChange={(value) => update("workMode", value)}
          />
          <FilterSelect
            label="Availability"
            value={filters.availability}
            anyLabel="Any availability"
            options={availabilityOptions}
            onValueChange={(value) => update("availability", value)}
          />
        </section>
        <section
          className="job-filter-section job-filter-section-wide"
          aria-labelledby={id + "-company"}
        >
          <h3 id={id + "-company"}>Company & source</h3>
          <div className="job-filter-field-grid">
            <FilterSelect
              label="Company"
              value={filters.companyId}
              anyLabel="Any company"
              options={(companies.data ?? []).map((company) => ({
                value: company.id,
                label: company.name,
              }))}
              onValueChange={(value) => update("companyId", value)}
              loading={companies.isPending}
              failed={companies.isError}
              onRetry={() => void companies.refetch()}
              emptyMessage="No companies added yet."
            />
            <FilterSelect
              label="Configured source"
              value={filters.sourceIds}
              anyLabel="Any configured source"
              options={(sources.data ?? []).map((source) => ({
                value: source.id,
                label: source.label,
              }))}
              onValueChange={(value) => update("sourceIds", value)}
              loading={sources.isPending}
              failed={sources.isError}
              onRetry={() => void sources.refetch()}
              emptyMessage="No configured sources yet."
            />
          </div>
        </section>
        <Collapsible
          className="job-filter-section-wide"
          defaultOpen={dateCount > 0}
        >
          <h3>
            <CollapsibleTrigger className="flex min-h-8 items-center gap-2 text-sm font-semibold">
              Dates{" "}
              <ChevronDown
                data-disclosure-icon
                className="size-3.5 text-muted-foreground"
              />
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {dateCount ? dateCount + " active" : "Any time"}
              </span>
            </CollapsibleTrigger>
          </h3>
          <CollapsibleContent>
            <div className="job-filter-field-grid pt-3">
              <div className="job-filter-field">
                <label htmlFor={id + "-posted"}>Posted on or after</label>
                <Input
                  id={id + "-posted"}
                  type="date"
                  value={filters.postedAfter ?? ""}
                  onChange={(event) =>
                    update("postedAfter", event.target.value)
                  }
                />
              </div>
              <div className="job-filter-field">
                <label htmlFor={id + "-discovered"}>
                  First discovered on or after
                </label>
                <Input
                  id={id + "-discovered"}
                  type="date"
                  value={filters.discoveredAfter ?? ""}
                  onChange={(event) =>
                    update("discoveredAfter", event.target.value)
                  }
                />
              </div>
              <p className="col-span-full text-xs leading-relaxed text-muted-foreground">
                Jobs with unknown posted dates are excluded only when a
                posted-date filter is set.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      <footer className="job-filter-footer">
        <div>
          <p
            className="flex items-center gap-2 text-sm font-medium"
            role="status"
            aria-live="polite"
          >
            {updating && (
              <LoadingStatus>
                <span className="sr-only">Updating results</span>
              </LoadingStatus>
            )}
            {resultCount === undefined ? (
              "Loading results…"
            ) : (
              <>
                <span className="font-mono tabular-nums">
                  {resultCount.toLocaleString()}
                </span>{" "}
                matching jobs
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Changes apply immediately
          </p>
        </div>
        <Button onClick={() => setOpen(false)}>Done</Button>
      </footer>
    </div>
  );
  return (
    <>
      <Select
        value={filters.relevance ?? defaultJobRelevance(filters)}
        onValueChange={(value) => change({ relevance: value, page: "1" })}
      >
        <SelectTrigger aria-label="Role relevance" className="w-auto min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="target">Target roles</SelectItem>
          <SelectItem value="all">All roles</SelectItem>
          <p className="max-w-64 border-t border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Matches job titles to your Profile roles. Without target roles, all
            jobs are shown.
          </p>
        </SelectContent>
      </Select>
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
      {mobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent className="job-filters-sheet flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-none">
            {content}
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            className="job-filters-popover flex flex-col overflow-hidden p-0"
            aria-labelledby={id + "-title"}
            aria-describedby={id + "-description"}
            collisionPadding={12}
          >
            {content}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
