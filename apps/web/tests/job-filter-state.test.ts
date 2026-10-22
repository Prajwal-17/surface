import { describe, expect, test } from "bun:test";
import { jobsListQuerySchema } from "@surface/contracts";
import {
  advancedFilterCount,
  describeJobFilter,
  resetAdvancedFilters,
} from "../src/features/jobs/filter-options";

describe("job filter controls", () => {
  test("counts advanced categories independently of toolbar and reader state", () => {
    const defaults = jobsListQuerySchema.parse({
      status: "saved",
      search: "engineer",
      source: "greenhouse",
      relevance: "all",
      sort: "best-fit",
      page: 4,
    });
    expect(advancedFilterCount(defaults)).toBe(0);
    const selected = jobsListQuerySchema.parse({
      ...defaults,
      reviewState: "unreviewed",
      workMode: "remote",
      companyId: "company-one",
      sourceIds: "source-one,source-two",
      eligibility: "clarify",
      assessment: "stale",
      availability: "open",
      postedAfter: "2026-01-01",
      discoveredAfter: "2026-02-01",
    });
    expect(advancedFilterCount(selected)).toBe(9);
  });
  test("reset preserves search, source type, role scope, sort, status, and reader", () => {
    const preserved = [
      "search",
      "source",
      "relevance",
      "sort",
      "status",
      "job",
      "limit",
    ];
    const patch = resetAdvancedFilters();
    for (const key of preserved) expect(key in patch).toBe(false);
    expect(patch.page).toBe("1");
    expect(patch.companyId).toBeUndefined();
    expect(patch.sourceIds).toBeUndefined();
    expect(patch.postedAfter).toBeUndefined();
    expect(patch.discoveredAfter).toBeUndefined();
  });
  test("chips identify companies and every configured source in a saved search", () => {
    const options = {
      companies: [{ id: "company-one", name: "Example company" }],
      sources: [
        { id: "one", label: "Careers" },
        { id: "two", label: "Remote jobs" },
      ],
    };
    expect(describeJobFilter("companyId", "company-one", options)).toBe(
      "Example company",
    );
    expect(describeJobFilter("sourceIds", "one,two", options)).toBe(
      "Careers, Remote jobs",
    );
    expect(describeJobFilter("companyId", "missing-id", options)).toBe(
      "Selected company",
    );
    expect(describeJobFilter("sourceIds", "missing-id", options)).toBe(
      "Selected source",
    );
  });
  test("freshness, eligibility, and work mode retain their separate meanings", () => {
    expect(describeJobFilter("assessment", "not-assessed", {})).toBe(
      "Not assessed",
    );
    expect(describeJobFilter("assessment", "stale", {})).toBe("Stale");
    expect(describeJobFilter("assessment", "legacy", {})).toBe("Legacy");
    expect(describeJobFilter("eligibility", "clarify", {})).toBe(
      "Needs clarification",
    );
    expect(describeJobFilter("workMode", "onsite", {})).toBe("On-site");
  });
});
