import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { env } from "../../config/env";
import { jobs } from "../jobs/jobs.tables";
import { findProfile } from "../profile/profile.repository";
import { workItems, runs, runItems } from "../work/work.tables";
import { assessments, aiUsage } from "./analysis.tables";
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
const activeAssessments = new Set<string>();
export function isAssessmentRunning(id: string) {
  return activeAssessments.has(id);
}

export async function assessJobNow(id: string) {
  const job = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), isNull(jobs.mergedInto)))
    .get();
  if (!job) throw new HttpError(404, "Job not found.");
  const profile = findProfile();
  if (!profile)
    throw new HttpError(409, "Save your profile before assessing a job.");
  if (!job.currentVersionId)
    throw new HttpError(409, "This job has no description version to assess.");
  const identity = analysisIdentity(job, profile.revision);
  const current = db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.jobId, id),
        eq(assessments.jobVersionId, job.currentVersionId),
        eq(assessments.profileRevision, profile.revision),
        eq(assessments.formatVersion, assessmentFormatVersion),
      ),
    )
    .get();
  if (current) return;
  if (
    activeAssessments.has(id) ||
    db
      .select({ id: workItems.id })
      .from(workItems)
      .where(
        and(
          eq(workItems.jobId, id),
          eq(workItems.kind, "analysis"),
          eq(workItems.state, "running"),
        ),
      )
      .get()
  )
    throw new HttpError(409, "An assessment is already running for this job.");
  const settings = getSettings();
  if (!settings.configured)
    throw new HttpError(
      409,
      "Configure AI in Settings before assessing a job.",
    );
  if (settings.paused)
    throw new HttpError(
      409,
      "Assessment is paused. Resume it in Settings first.",
    );
  if (settings.used >= settings.dailyLimit)
    throw new HttpError(
      429,
      "Daily AI limit reached. Try after the allowance resets or update it in Settings.",
    );
  const usageId = reserveRequest(
    `assessment:${id}:${crypto.randomUUID()}`,
    settings.configured,
    true,
  );
  if (!usageId)
    throw new HttpError(
      409,
      "AI is busy. Try again when a current request finishes; this assessment has not been queued.",
    );
  activeAssessments.add(id);
  try {
    // A direct click supersedes any old waiting request for this job.
    db.update(workItems)
      .set({
        state: "interrupted",
        error: "Replaced by an immediate assessment.",
        completedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(workItems.jobId, id),
          eq(workItems.kind, "analysis"),
          eq(workItems.state, "queued"),
        ),
      )
      .run();
    syncRuns();
    const result = await requestAssessment(profile, job);
    db.transaction((tx) => {
      const latestJob = tx.select().from(jobs).where(eq(jobs.id, id)).get();
      const latestProfile = findProfile();
      if (
        !latestJob ||
        latestJob.mergedInto ||
        !latestProfile ||
        analysisIdentity(latestJob, latestProfile.revision) !== identity
      )
        throw new HttpError(
          409,
          "The job or profile changed during assessment. Click Assess again for the updated details.",
        );
      tx.insert(assessments)
        .values({
          id: crypto.randomUUID(),
          jobId: id,
          jobVersionId: job.currentVersionId!,
          profileRevision: profile.revision,
          formatVersion: assessmentFormatVersion,
          output: result.output,
          model: result.model,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
      tx.update(jobs)
        .set({ analysisRequested: false })
        .where(eq(jobs.id, id))
        .run();
      tx.update(aiUsage)
        .set({ outcome: "completed" })
        .where(eq(aiUsage.id, usageId))
        .run();
    });
  } catch (error) {
    db.update(aiUsage)
      .set({
        outcome:
          error instanceof HttpError && error.status === 409
            ? "stale"
            : "failed",
      })
      .where(eq(aiUsage.id, usageId))
      .run();
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      error instanceof Error
        ? error.message
        : "Could not assess this job. Try again.",
    );
  } finally {
    activeAssessments.delete(id);
  }
}

export function enqueueAnalysis(onlyIds: string[]) {
  if (!onlyIds.length) return null;
  const profile = findProfile();
  if (!profile)
    throw new HttpError(409, "Save your profile before assessing a job.");
  return db.transaction((tx) => {
    const now = new Date().toISOString();
    const candidates = tx
      .select()
      .from(jobs)
      .where(and(inArray(jobs.id, onlyIds), isNull(jobs.mergedInto)))
      .all();
    if (candidates.length !== new Set(onlyIds).size)
      throw new HttpError(404, "Job not found.");
    let runId: string | null = null;
    for (const job of candidates) {
      if (!job.currentVersionId)
        throw new HttpError(
          409,
          "This job has no description version to assess.",
        );
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
      if (current) continue;
      const identity = analysisIdentity(job, profile.revision);
      const existing = tx
        .select()
        .from(workItems)
        .where(eq(workItems.identity, identity))
        .orderBy(desc(workItems.createdAt))
        .get();
      if (existing && ["queued", "running"].includes(existing.state)) continue;
      if (!runId) {
        runId = crypto.randomUUID();
        tx.insert(runs)
          .values({
            id: runId,
            kind: "analysis",
            label: "Requested assessment",
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
    item.identity !== analysisIdentity(job, profile.revision)
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
    const usageId = reserveRequest(item.id, configured, true);
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
