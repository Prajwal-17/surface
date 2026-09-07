import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { env } from "../../config/env";
import { jobs } from "../jobs/jobs.tables";
import { findProfile } from "../profile/profile.repository";
import { workItems, runs, runItems } from "../work/work.tables";
import { assessments, aiUsage } from "./analysis.tables";
import { checkEligibility } from "./eligibility";
import { getSettings, reserveRequest } from "./allowance";
import {
  requestAssessment,
  validateAssessment,
  assessmentContext,
} from "./model";
import { assessmentFormatVersion, type WorkItem } from "../../shared/contracts";
import { syncRuns } from "../work/work.service";
import { HttpError } from "../../shared/errors/http-error";
export function analysisIdentity(
  job: typeof jobs.$inferSelect,
  revision: number,
) {
  return `analysis:${job.id}:${job.currentVersionId}:${revision}:${assessmentFormatVersion}`;
}
function relevant(job: typeof jobs.$inferSelect, roles: string) {
  const text = `${job.title} ${job.description.slice(0, 2000)}`.toLowerCase();
  return roles
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 2)
    .some((t) => text.includes(t));
}
export function enqueueAnalysis(backfill = false, onlyIds?: string[]) {
  const profile = findProfile();
  if (!profile) {
    if (backfill) throw new HttpError(409, "Save a usable profile first.");
    return null;
  }
  const settings = getSettings();
  if (!settings.enabled && !backfill) return null;
  return db.transaction((tx) => {
    const now = new Date().toISOString();
    if (backfill)
      tx.update(jobs)
        .set({ analysisRequested: true })
        .where(
          and(
            eq(jobs.status, "inbox"),
            isNull(jobs.mergedInto),
            ...(onlyIds ? [inArray(jobs.id, onlyIds)] : []),
          ),
        )
        .run();
    const candidates = tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.analysisRequested, true),
          eq(jobs.status, "inbox"),
          isNull(jobs.mergedInto),
          ...(onlyIds ? [inArray(jobs.id, onlyIds)] : []),
        ),
      )
      .all();
    let runId: string | null = null;
    for (const job of candidates) {
      if (
        !job.currentVersionId ||
        checkEligibility(job, profile.context).state === "conflicts" ||
        !relevant(job, profile.targetRoles)
      )
        continue;
      const current = tx
        .select()
        .from(assessments)
        .where(
          and(
            eq(assessments.jobId, job.id),
            eq(assessments.jobVersionId, job.currentVersionId),
            eq(assessments.profileRevision, profile.revision),
            eq(assessments.formatVersion, assessmentFormatVersion),
          ),
        )
        .get();
      if (current) {
        tx.update(jobs)
          .set({ analysisRequested: false })
          .where(eq(jobs.id, job.id))
          .run();
        continue;
      }
      const identity = analysisIdentity(job, profile.revision);
      const existing = tx
        .select()
        .from(workItems)
        .where(eq(workItems.identity, identity))
        .orderBy(desc(workItems.createdAt))
        .get();
      if (
        existing &&
        (["queued", "running", "completed"].includes(existing.state) ||
          !backfill)
      )
        continue;
      if (!runId) {
        runId = crypto.randomUUID();
        tx.insert(runs)
          .values({
            id: runId,
            kind: "analysis",
            label: backfill ? "Analyze existing inbox" : "Automatic assessment",
            state: "queued",
            createdAt: now,
          })
          .run();
      }
      const id = crypto.randomUUID();
      tx.insert(workItems)
        .values({
          id,
          kind: "analysis",
          jobId: job.id,
          identity,
          state: "queued",
          retryAt: now,
          createdAt: now,
        })
        .run();
      tx.insert(runItems).values({ runId, workId: id }).run();
    }
    if (!runId && backfill) {
      runId = crypto.randomUUID();
      tx.insert(runs)
        .values({
          id: runId,
          kind: "analysis",
          label: "Inbox already queued or no eligible unassessed jobs",
          state: "completed",
          createdAt: now,
          completedAt: now,
        })
        .run();
    }
    return runId ? { runId } : null;
  });
}
export async function executeAnalysis(
  item: WorkItem,
  analyzer = requestAssessment,
  configured = Boolean(env.OMNIROUTE_API_KEY),
) {
  const profile = findProfile(),
    job = item.jobId
      ? db.select().from(jobs).where(eq(jobs.id, item.jobId)).get()
      : null;
  const now = new Date().toISOString();
  if (
    !profile ||
    !job ||
    job.mergedInto ||
    job.status !== "inbox" ||
    item.identity !== analysisIdentity(job, profile.revision) ||
    checkEligibility(job, profile.context).state === "conflicts"
  ) {
    db.update(workItems)
      .set({
        state: "interrupted",
        error:
          "Job or profile changed before dispatch; queued context is stale.",
        completedAt: now,
      })
      .where(eq(workItems.id, item.id))
      .run();
    return;
  }
  const reservation = db.transaction((tx) => {
    const claimed = tx
      .update(workItems)
      .set({ state: "running", startedAt: now })
      .where(and(eq(workItems.id, item.id), eq(workItems.state, "queued")))
      .returning()
      .get();
    if (!claimed) return null;
    const usageId = reserveRequest(item.id, configured);
    if (!usageId) {
      const settings = getSettings();
      tx.update(workItems)
        .set({
          state: "queued",
          startedAt: null,
          retryAt:
            settings.used >= settings.dailyLimit ? settings.nextResetAt : now,
        })
        .where(eq(workItems.id, item.id))
        .run();
      return null;
    }
    tx.update(workItems)
      .set({ attempts: sql`${workItems.attempts} + 1` })
      .where(eq(workItems.id, item.id))
      .run();
    return usageId;
  });
  if (!reservation) return;
  try {
    const result = await analyzer(profile, job);
    const output = validateAssessment(
      result.output,
      assessmentContext(profile, job),
    );
    db.transaction((tx) => {
      const latestJob = tx.select().from(jobs).where(eq(jobs.id, job.id)).get(),
        latestProfile = findProfile();
      if (
        !latestJob ||
        latestJob.mergedInto ||
        latestJob.status !== "inbox" ||
        !latestProfile ||
        analysisIdentity(latestJob, latestProfile.revision) !== item.identity
      ) {
        tx.update(workItems)
          .set({
            state: "interrupted",
            error:
              "Discarded stale result: the job or profile changed during analysis.",
            completedAt: new Date().toISOString(),
          })
          .where(eq(workItems.id, item.id))
          .run();
        tx.update(aiUsage)
          .set({ outcome: "stale" })
          .where(eq(aiUsage.id, reservation))
          .run();
        return;
      }
      tx.insert(assessments)
        .values({
          id: crypto.randomUUID(),
          jobId: job.id,
          jobVersionId: job.currentVersionId!,
          profileRevision: profile.revision,
          formatVersion: assessmentFormatVersion,
          output,
          model: result.model,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
      tx.update(jobs)
        .set({ analysisRequested: false })
        .where(eq(jobs.id, job.id))
        .run();
      tx.update(workItems)
        .set({
          state: "completed",
          error: null,
          result: { assessed: 1 },
          completedAt: new Date().toISOString(),
        })
        .where(eq(workItems.id, item.id))
        .run();
      tx.update(aiUsage)
        .set({ outcome: "completed" })
        .where(eq(aiUsage.id, reservation))
        .run();
    });
  } catch (error) {
    const row = db
      .select()
      .from(workItems)
      .where(eq(workItems.id, item.id))
      .get()!;
    const retry = row.attempts < 3;
    db.update(workItems)
      .set({
        state: retry ? "queued" : "failed",
        retryAt: new Date(Date.now() + 60000 * 2 ** row.attempts).toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Invalid assessment response.",
        completedAt: retry ? null : new Date().toISOString(),
      })
      .where(eq(workItems.id, item.id))
      .run();
    db.update(aiUsage)
      .set({ outcome: "failed" })
      .where(eq(aiUsage.id, reservation))
      .run();
  }
  syncRuns();
}
