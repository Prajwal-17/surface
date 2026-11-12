import {
  executeCompanyWork,
  enqueueCompanySchedules,
} from "../company-discovery/service";
import { executeAnalysis } from "../analysis/analysis.service";
import { getSettings } from "../analysis/settings";
import { and, eq, lte, sql } from "drizzle-orm";
import {
  db,
  pg,
  type Database,
  type Transaction,
} from "../../infrastructure/database/client";
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
export async function recordInventory(
  sourceId: string,
  result: CollectionResult,
  connection: Database | Transaction = db,
) {
  if (!result.complete || result.error) return;
  const observed = new Set(result.candidates.map(createSourceRecordKey));
  for (const ref of await connection
    .select()
    .from(jobSources)
    .where(eq(jobSources.configuredSourceId, sourceId))) {
    if (observed.has(ref.sourceRecordKey)) continue;
    const missingChecks = ref.missingChecks + 1;
    await connection
      .update(jobSources)
      .set({
        missingChecks,
        availability: missingChecks >= 3 ? "closed" : "missing",
      })
      .where(eq(jobSources.id, ref.id));
  }
}
export async function recoverInterruptedWork() {
  await db
    .update(workItems)
    .set({
      state: "interrupted",
      error: "Backend stopped while this item was running. Retry is available.",
      completedAt: new Date().toISOString(),
    })
    .where(eq(workItems.state, "running"));
  await db
    .update(workItems)
    .set({
      state: "queued",
      retryAt: new Date().toISOString(),
      completedAt: null,
    })
    .where(
      and(
        eq(workItems.state, "interrupted"),
        sql`${workItems.kind} IN ('company-discovery','company-enrichment')`,
        sql`${workItems.attempts}<3`,
        eq(
          workItems.error,
          "Backend stopped while this item was running. Retry is available.",
        ),
      ),
    );
  await syncRuns();
}
export async function executeCollection(
  item: WorkItem,
  collector = collectSource,
) {
  const source = (
    await db
      .select()
      .from(configuredSources)
      .where(eq(configuredSources.id, item.sourceId!))
      .limit(1)
  )[0];
  const now = new Date().toISOString();
  if (
    !source ||
    source.paused ||
    (source.companyId &&
      (
        await db
          .select()
          .from(companies)
          .where(
            and(
              eq(companies.id, source.companyId),
              eq(companies.archived, true),
            ),
          )
          .limit(1)
      )[0])
  ) {
    await db
      .update(workItems)
      .set({
        state: "interrupted",
        error: "Source paused, removed, or company archived.",
        completedAt: now,
      })
      .where(eq(workItems.id, item.id));
    return;
  }
  if (source.retryAt && source.retryAt > now) {
    await db
      .update(workItems)
      .set({ retryAt: source.retryAt })
      .where(eq(workItems.id, item.id));
    return;
  }
  // Respect shared provider guidance even when differently filtered endpoints were configured.
  if (
    ["remotive", "jobicy", "remote-ok", "we-work-remotely"].includes(
      source.provider,
    )
  ) {
    const latest = (
      await db
        .select()
        .from(configuredSources)
        .where(eq(configuredSources.provider, source.provider))
    )
      .map((s) => s.retryAt)
      .filter((v): v is string => Boolean(v))
      .toSorted()
      .at(-1);
    if (latest && latest > now) {
      await db
        .update(workItems)
        .set({ retryAt: latest })
        .where(eq(workItems.id, item.id));
      return;
    }
  }
  const claimed = (
    await db
      .update(workItems)
      .set({
        state: "running",
        attempts: sql`${workItems.attempts} + 1`,
        startedAt: now,
      })
      .where(and(eq(workItems.id, item.id), eq(workItems.state, "queued")))
      .returning()
  )[0];
  if (!claimed) return;
  const nextAllowed = new Date(
    Date.now() + minimumFetchHours(source.provider) * 3600000,
  ).toISOString();
  await db
    .update(configuredSources)
    .set({ retryAt: nextAllowed })
    .where(eq(configuredSources.id, source.id));
  try {
    const result = await collector(configuredSourceSchema.parse(source));
    const outcomes = await db.transaction(async (tx) => {
      const counts = await upsertCandidates(result.candidates, tx);
      await recordInventory(source.id, result, tx);
      return counts;
    });
    await db
      .update(workItems)
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
      .where(eq(workItems.id, item.id));
    await db
      .update(configuredSources)
      .set({
        lastSuccessAt: result.error
          ? source.lastSuccessAt
          : new Date().toISOString(),
        failureCount: 0,
        reason: result.error ?? "Last collection succeeded.",
      })
      .where(eq(configuredSources.id, source.id));
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
    await db
      .update(configuredSources)
      .set({
        failureCount,
        retryAt,
        reason: message,
        ...(unsupported ? { support: "unsupported" as const } : {}),
      })
      .where(eq(configuredSources.id, source.id));
    await db
      .update(workItems)
      .set({
        state: claimed.attempts < 3 && !unsupported ? "queued" : "failed",
        error: message,
        retryAt,
        completedAt:
          claimed.attempts < 3 && !unsupported
            ? null
            : new Date().toISOString(),
      })
      .where(eq(workItems.id, item.id));
  }
  await syncRuns();
}
let tickActive = false;
let analysisActive = false;
export async function startExecutor() {
  const owner = crypto.randomUUID();
  let acquired = false;
  const heartbeat = async () => {
    const now = Date.now();
    await pg`
      INSERT INTO executor_lease(id,owner,expires_at) VALUES('backend',${owner},${now + 30000})
      ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
      WHERE executor_lease.owner=excluded.owner OR executor_lease.expires_at < ${now}`;
    const lease = (
      await db
        .select()
        .from(executorLease)
        .where(eq(executorLease.id, "backend"))
        .limit(1)
    )[0];
    return lease?.owner === owner;
  };
  const tick = async () => {
    if (!(await heartbeat())) return;
    if (!acquired) {
      acquired = true;
      await recoverInterruptedWork();
    }
    if (!analysisActive) {
      analysisActive = true;
      void (async () => {
        try {
          const settings = await getSettings();
          if (settings.configured && !settings.paused) {
            const pending = await db
              .select()
              .from(workItems)
              .where(
                and(
                  eq(workItems.kind, "analysis"),
                  eq(workItems.state, "queued"),
                  lte(workItems.retryAt, new Date().toISOString()),
                ),
              )
              .limit(2);
            await Promise.allSettled(
              pending.map((item) => executeAnalysis(item)),
            );
          }
        } catch (error) {
          console.error("Analysis executor failed", error);
        } finally {
          analysisActive = false;
          await syncRuns();
        }
      })();
    }
    if (tickActive) return;
    tickActive = true;
    try {
      await enqueueCompanySchedules();
      const companyItems = await db
        .select()
        .from(workItems)
        .where(
          and(
            sql`${workItems.kind} IN ('company-discovery','company-enrichment')`,
            eq(workItems.state, "queued"),
            lte(workItems.retryAt, new Date().toISOString()),
          ),
        )
        .limit(2);
      await Promise.allSettled(
        companyItems.map((item) => executeCompanyWork(item)),
      );
      await enqueueDueSchedules();
      const items = await db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.kind, "collection"),
            eq(workItems.state, "queued"),
            lte(workItems.retryAt, new Date().toISOString()),
          ),
        )
        .limit(2);
      await Promise.allSettled(items.map((item) => executeCollection(item)));
      await syncRuns();
    } catch (error) {
      console.error("Executor tick failed", error);
    } finally {
      tickActive = false;
    }
  };
  const runTick = () => {
    void tick().catch((error) =>
      console.error("Executor heartbeat failed", error),
    );
  };
  runTick();
  const timer = setInterval(runTick, 2000);
  const stop = async () => {
    clearInterval(timer);
    await db
      .delete(executorLease)
      .where(
        and(eq(executorLease.id, "backend"), eq(executorLease.owner, owner)),
      );
  };
  return stop;
}
