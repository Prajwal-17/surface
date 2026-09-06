import {
  sourceLabels,
  type DiscoverySearchInput,
  type DiscoverySearchResponse,
  type SourceRunSummary,
} from "@repo/contracts";
import { env } from "../../config/env";
import {
  matchesSearch,
  normalizeCandidate,
  type JobCandidate,
} from "../../shared/normalization/job-normalization";
import { upsertCandidates } from "../jobs";
import {
  completeDiscoveryRun,
  createDiscoveryRun,
  saveSourceRun,
} from "./discovery.repository";
import { sourceAdapters } from "./sources";
import type {
  SourceAdapter,
  SourceSearchResult,
} from "./sources/source-adapter";

interface SuccessfulSource {
  summary: SourceRunSummary;
  jobs: JobCandidate[];
}

function safeError(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "The source timed out.";
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") return "The source timed out.";
    return error.message.slice(0, 240);
  }

  return "The source could not be reached.";
}

async function searchSource(
  adapter: SourceAdapter,
  input: DiscoverySearchInput,
): Promise<SuccessfulSource> {
  const startedAt = performance.now();
  const result: SourceSearchResult = await adapter.search(
    input,
    AbortSignal.timeout(env.SOURCE_TIMEOUT_MS),
  );

  const normalized = result.jobs.flatMap<JobCandidate>((candidate) => {
    try {
      return [normalizeCandidate(candidate)];
    } catch {
      return [];
    }
  });
  const jobs = normalized.filter((candidate) =>
    matchesSearch(candidate, input),
  );

  return {
    jobs,
    summary: {
      source: adapter.key,
      label: adapter.label,
      status: "success",
      fetchedCount: result.fetchedCount,
      acceptedCount: jobs.length,
      durationMs: Math.round(performance.now() - startedAt),
      error: null,
    },
  };
}

export async function runDiscovery(
  input: DiscoverySearchInput,
): Promise<DiscoverySearchResponse> {
  const run = createDiscoveryRun(input);
  const startedTimes = new Map(
    sourceAdapters.map((adapter) => [adapter.key, performance.now()]),
  );
  const settled = await Promise.allSettled(
    sourceAdapters.map((adapter) => searchSource(adapter, input)),
  );

  const sourceSummaries: SourceRunSummary[] = [];
  const candidates: JobCandidate[] = [];

  settled.forEach((result, index) => {
    const adapter = sourceAdapters[index];
    if (!adapter) return;

    if (result.status === "fulfilled") {
      sourceSummaries.push(result.value.summary);
      candidates.push(...result.value.jobs);
      return;
    }

    sourceSummaries.push({
      source: adapter.key,
      label: sourceLabels[adapter.key],
      status: "failed",
      fetchedCount: 0,
      acceptedCount: 0,
      durationMs: Math.round(
        performance.now() -
          (startedTimes.get(adapter.key) ?? performance.now()),
      ),
      error: safeError(result.reason),
    });
  });

  for (const summary of sourceSummaries) {
    saveSourceRun(run.id, summary);
  }

  const successfulSources = sourceSummaries.filter(
    (summary) => summary.status === "success",
  ).length;
  const status =
    successfulSources === 0
      ? "failed"
      : successfulSources < sourceAdapters.length
        ? "partial"
        : "completed";

  const { insertedCount, updatedCount } = upsertCandidates(candidates);
  const resultCount = insertedCount + updatedCount;
  const runSummary = completeDiscoveryRun(
    run,
    input,
    status,
    resultCount,
    insertedCount,
    updatedCount,
  );

  return {
    run: runSummary,
    sources: sourceSummaries,
    insertedCount,
    updatedCount,
  };
}
