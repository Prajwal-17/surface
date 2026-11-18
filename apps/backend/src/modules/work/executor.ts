import {
  executeCompanyWork,
  enqueueCompanySchedules,
} from "../company-discovery/service";
import {
  recoverInterruptedJobSearch,
  runDueJobSearch,
} from "../jobs/job-search.service";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, rawQuery } from "../../infrastructure/database/client";
import { workItems, executorLease } from "./work.tables";
import { syncRuns } from "./work.service";
export async function recoverInterruptedWork() {
  const now = new Date().toISOString();
  await db
    .update(workItems)
    .set({
      state: "interrupted",
      error: "Backend stopped while this item was running. Retry is available.",
      completedAt: now,
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
  await db
    .update(workItems)
    .set({
      state: "interrupted",
      error: "Legacy job collection is disabled.",
      completedAt: now,
    })
    .where(
      and(
        eq(workItems.kind, "collection"),
        sql`${workItems.state} IN ('queued','interrupted')`,
      ),
    );
  await recoverInterruptedJobSearch();
  await syncRuns();
}
let tickActive = false;
export async function startExecutor() {
  const owner = crypto.randomUUID();
  let acquired = false;
  const heartbeat = async () => {
    const now = Date.now();
    await rawQuery`
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
      await runDueJobSearch();
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
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (!tickActive) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await db
      .delete(executorLease)
      .where(
        and(eq(executorLease.id, "backend"), eq(executorLease.owner, owner)),
      );
  };
  return stop;
}
