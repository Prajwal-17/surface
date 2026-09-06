import type {
  DiscoveryRunSummary,
  DiscoverySearchInput,
  SourceRunSummary,
} from "@repo/contracts";
import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { discoveryRuns, discoverySourceRuns } from "./discovery.tables";

export interface DiscoveryRunRecord {
  id: string;
  startedAt: string;
}

export function createDiscoveryRun(
  input: DiscoverySearchInput,
): DiscoveryRunRecord {
  const run = {
    id: crypto.randomUUID(),
    query: input.query,
    location: input.location ?? null,
    status: "running" as const,
    startedAt: new Date().toISOString(),
  };

  db.insert(discoveryRuns).values(run).run();
  return { id: run.id, startedAt: run.startedAt };
}

export function saveSourceRun(runId: string, summary: SourceRunSummary): void {
  db.insert(discoverySourceRuns)
    .values({
      id: crypto.randomUUID(),
      runId,
      ...summary,
      createdAt: new Date().toISOString(),
    })
    .run();
}

export function completeDiscoveryRun(
  run: DiscoveryRunRecord,
  input: DiscoverySearchInput,
  status: DiscoveryRunSummary["status"],
  resultCount: number,
  insertedCount: number,
  updatedCount: number,
): DiscoveryRunSummary {
  const completedAt = new Date().toISOString();

  db.update(discoveryRuns)
    .set({
      status,
      resultCount,
      insertedCount,
      updatedCount,
      completedAt,
    })
    .where(eq(discoveryRuns.id, run.id))
    .run();

  return {
    id: run.id,
    query: input.query,
    location: input.location ?? null,
    status,
    resultCount,
    startedAt: run.startedAt,
    completedAt,
  };
}
