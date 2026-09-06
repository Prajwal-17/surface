import type { DiscoverySearchInput, SourceKey } from "@repo/contracts";
import type { JobCandidate } from "../../../shared/normalization/job-normalization";

export interface SourceSearchResult {
  jobs: JobCandidate[];
  fetchedCount: number;
}

export interface SourceAdapter {
  readonly key: SourceKey;
  readonly label: string;
  search(
    input: DiscoverySearchInput,
    signal: AbortSignal,
  ): Promise<SourceSearchResult>;
}

export async function fetchJson(
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "JobSearchV1/0.1 (local personal job discovery)",
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream responded with HTTP ${response.status}.`);
  }

  return response.json();
}

export async function fetchText(
  url: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
      "User-Agent": "JobSearchV1/0.1 (local personal job discovery)",
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream responded with HTTP ${response.status}.`);
  }

  return response.text();
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
