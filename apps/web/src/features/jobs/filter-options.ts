import { sourceLabels, type JobsListQuery } from "@surface/contracts";
import type { ChoiceOption } from "@/components/ui/choice-group";

export const reviewChoices: ChoiceOption[] = [
  { value: "all", label: "Any" },
  { value: "unreviewed", label: "Unreviewed" },
  { value: "reviewed", label: "Reviewed" },
];
export const workModeChoices: ChoiceOption[] = [
  { value: "all", label: "Any" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
  { value: "unknown", label: "Unknown" },
];
export const eligibilityOptions: ChoiceOption[] = [
  { value: "meets", label: "Meets stated constraints" },
  { value: "clarify", label: "Needs clarification" },
  { value: "conflicts", label: "Conflicts with constraints" },
];
export const assessmentOptions: ChoiceOption[] = [
  { value: "not-assessed", label: "Not assessed" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "failed", label: "Failed" },
  { value: "current", label: "Current" },
  { value: "stale", label: "Stale" },
  { value: "legacy", label: "Legacy" },
];
export const availabilityOptions: ChoiceOption[] = [
  { value: "open", label: "Observed open" },
  { value: "possibly-closed", label: "Possibly closed / unknown" },
  { value: "closed", label: "Closed" },
];
export const advancedFilterKeys = [
  "reviewState",
  "companyId",
  "sourceIds",
  "workMode",
  "eligibility",
  "assessment",
  "availability",
  "postedAfter",
  "discoveredAfter",
] as const satisfies readonly (keyof JobsListQuery)[];

export function advancedFilterCount(filters: JobsListQuery) {
  return advancedFilterKeys.filter((key) => Boolean(filters[key])).length;
}

export function resetAdvancedFilters(): Record<string, string | undefined> {
  return {
    ...Object.fromEntries(advancedFilterKeys.map((key) => [key, undefined])),
    page: "1",
  };
}

export function describeJobFilter(
  key: string,
  value: string,
  options: {
    companies?: readonly { id: string; name: string }[];
    sources?: readonly { id: string; label: string }[];
  },
): string {
  if (key === "companyId")
    return (
      options.companies?.find((company) => company.id === value)?.name ??
      "Selected company"
    );
  if (key === "sourceIds")
    return value
      .split(",")
      .filter(Boolean)
      .map(
        (id) =>
          options.sources?.find((source) => source.id === id)?.label ??
          "Selected source",
      )
      .join(", ");
  if (key === "source")
    return sourceLabels[value as keyof typeof sourceLabels] ?? value;
  if (key === "relevance")
    return value === "target" ? "Target roles" : "All roles";
  const choices: Record<string, readonly ChoiceOption[]> = {
    reviewState: reviewChoices,
    workMode: workModeChoices,
    eligibility: eligibilityOptions,
    assessment: assessmentOptions,
    availability: availabilityOptions,
  };
  return choices[key]?.find((option) => option.value === value)?.label ?? value;
}
