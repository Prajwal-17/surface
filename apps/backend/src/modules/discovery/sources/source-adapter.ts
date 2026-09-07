import type { SourceKey } from "../../../shared/contracts";
import type { JobCandidate } from "../../../shared/normalization/job-normalization";

interface SourceSearchResult {
  jobs: JobCandidate[];
  fetchedCount: number;
}

export interface SourceAdapter {
  extract(payload: unknown): SourceSearchResult;
  readonly key: SourceKey;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
