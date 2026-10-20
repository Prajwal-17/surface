import { executeAnalysis } from "../analysis/analysis.service";
import { getSettings } from "../analysis/settings";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, sqlite } from "../../infrastructure/database/client";
import { configuredSources, companies } from "../workspace/workspace.tables";
import { jobSources } from "../jobs/jobs.tables";
import { upsertCandidates } from "../jobs/jobs.repository";
import {
  collectSource,
  type CollectionResult,
} from "../collection/collection.service";
import { FetchFailure } from "../collection/public-http";
import { workItems, executorLease } from "./work.tables";
import {
  enqueueDueSchedules,
  minimumFetchHours,
  syncRuns,
} from "./work.service";
import { createSourceRecordKey } from "../../shared/normalization/job-normalization";
import { configuredSourceSchema, type WorkItem } from "@surface/contracts";
export function recordInventory(sourceId: string, result: CollectionResult) {
  if (!result.complete || result.error) return;
  const observed = new Set(result.candidates.map(createSourceRecordKey));
  for (const ref of db
    .select()
    .from(jobSources)
    .where(eq(jobSources.configuredSourceId, sourceId))
    .all()) {
    if (observed.has(ref.sourceRecordKey)) continue;
    const missingChecks = ref.missingChecks + 1;
    db.update(jobSources)
      .set({
        missingChecks,
        availability: missingChecks >= 3 ? "closed" : "missing",
      })
      .where(eq(jobSources.id, ref.id))
      .run();
  }
}
export function recoverInterruptedWork() {
  db.update(workItems)
    .set({
      state: "interrupted",
      error: "Backend stopped while this item was running. Retry is available.",
      completedAt: new Date().toISOString(),
    })
    .where(eq(workItems.state, "running"))
    .run();
  syncRuns();
}
export async function executeCollection(
  item: WorkItem,
  collector = collectSource,
) {
  const source = db
    .select()
    .from(configuredSources)
    .where(eq(configuredSources.id, item.sourceId!))
    .get();
  const now = new Date().toISOString();
  if (
    !source ||
    source.paused ||
    (source.companyId &&
      db
        .select()
        .from(companies)
        .where(
          and(eq(companies.id, source.companyId), eq(companies.archived, true)),
        )
        .get())
  ) {
    db.update(workItems)
      .set({
        state: "interrupted",
        error: "Source paused, removed, or company archived.",
        completedAt: now,
      })
      .where(eq(workItems.id, item.id))
      .run();
    return;
  }
  if (source.retryAt && source.retryAt > now) {
    db.update(workItems)
      .set({ retryAt: source.retryAt })
      .where(eq(workItems.id, item.id))
      .run();
    return;
  }
  // Respect shared provider guidance even when differently filtered endpoints were configured.
  if (
    ["remotive", "jobicy", "remote-ok", "we-work-remotely"].includes(
      source.provider,
    )
  ) {
    const latest = db
      .select()
      .from(configuredSources)
      .where(eq(configuredSources.provider, source.provider))
      .all()
      .map((s) => s.retryAt)
      .filter((v): v is string => Boolean(v))
      .toSorted()
      .at(-1);
    if (latest && latest > now) {
      db.update(workItems)
        .set({ retryAt: latest })
        .where(eq(workItems.id, item.id))
        .run();
      return;
    }
  }
  const claimed = db
    .update(workItems)
    .set({
      state: "running",
      attempts: sql`${workItems.attempts} + 1`,
      startedAt: now,
    })
    .where(and(eq(workItems.id, item.id), eq(workItems.state, "queued")))
    .returning()
    .get();
  if (!claimed) return;
  const nextAllowed = new Date(
    Date.now() + minimumFetchHours(source.provider) * 3600000,
  ).toISOString();
  db.update(configuredSources)
    .set({ retryAt: nextAllowed })
    .where(eq(configuredSources.id, source.id))
    .run();
  try {
    const result = await collector(configuredSourceSchema.parse(source));
    const outcomes = db.transaction(() => {
      const counts = upsertCandidates(result.candidates);
      recordInventory(source.id, result);
      return counts;
    });
    db.update(workItems)
      .set({
        state: result.error ? "partial" : "completed",
        result: {
          ...outcomes,
          completeInventory: result.complete,
          observedCount: result.candidates.length,
        },
        error: result.error,
        completedAt: new Date().toISOString(),
      })
      .where(eq(workItems.id, item.id))
      .run();
    db.update(configuredSources)
      .set({
        lastSuccessAt: result.error
          ? source.lastSuccessAt
          : new Date().toISOString(),
        failureCount: 0,
        reason: result.error ?? "Last collection succeeded.",
      })
      .where(eq(configuredSources.id, source.id))
      .run();
  } catch (error) {
    const failureCount = source.failureCount + 1;
    const retryAt = new Date(
      Math.max(
        Date.parse(nextAllowed),
        Date.now() + Math.min(24 * 3600000, 60000 * 2 ** failureCount),
        error instanceof FetchFailure && error.retryAt
          ? Date.parse(error.retryAt)
          : 0,
      ),
    ).toISOString();
    const message =
      error instanceof Error ? error.message : "Collection failed.";
    const unsupported = message.startsWith("Unsupported:");
    db.update(configuredSources)
      .set({
        failureCount,
        retryAt,
        reason: message,
        ...(unsupported ? { support: "unsupported" as const } : {}),
      })
      .where(eq(configuredSources.id, source.id))
      .run();
    db.update(workItems)
      .set({
        state: claimed.attempts < 3 && !unsupported ? "queued" : "failed",
        error: message,
        retryAt,
        completedAt:
          claimed.attempts < 3 && !unsupported
            ? null
            : new Date().toISOString(),
      })
      .where(eq(workItems.id, item.id))
      .run();
  }
  syncRuns();
}
let tickActive = false;
let analysisActive = false;
export function startExecutor() {
  const owner = crypto.randomUUID();
  let acquired = false;
  const heartbeat = () => {
    const now = Date.now();
    sqlite
      .query(
        "INSERT INTO executor_lease(id,owner,expires_at) VALUES('backend',?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE executor_lease.owner=excluded.owner OR executor_lease.expires_at < ?",
      )
      .run(owner, now + 30000, now);
    const lease = db
      .select()
      .from(executorLease)
      .where(eq(executorLease.id, "backend"))
      .get();
    return lease?.owner === owner;
  };
  const tick = async () => {
    if (!heartbeat()) return;
    if (!acquired) {
      acquired = true;
      recoverInterruptedWork();
    }
    if (!analysisActive) {
      analysisActive = true;
      void (async () => {
        try {
          const settings = getSettings();
          if (settings.configured && !settings.paused) {
            const pending = db
              .select()
              .from(workItems)
              .where(
                and(
                  eq(workItems.kind, "analysis"),
                  eq(workItems.state, "queued"),
                  lte(workItems.retryAt, new Date().toISOString()),
                ),
              )
              .limit(2)
              .all();
            await Promise.allSettled(
              pending.map((item) => executeAnalysis(item)),
            );
          }
        } catch (error) {
          console.error("Analysis executor failed", error);
        } finally {
          analysisActive = false;
          syncRuns();
        }
      })();
    }
    if (tickActive) return;
    tickActive = true;
    try {
      enqueueDueSchedules();
      const items = db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.kind, "collection"),
            eq(workItems.state, "queued"),
            lte(workItems.retryAt, new Date().toISOString()),
          ),
        )
        .limit(2)
        .all();
      await Promise.allSettled(items.map((item) => executeCollection(item)));
      syncRuns();
    } catch (error) {
      console.error("Executor tick failed", error);
    } finally {
      tickActive = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 2000);
  const stop = () => {
    clearInterval(timer);
    db.delete(executorLease)
      .where(
        and(eq(executorLease.id, "backend"), eq(executorLease.owner, owner)),
      )
      .run();
  };
  return stop;
}
