import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, transaction } from "../../infrastructure/database/client";
import { lockCoordination } from "../../infrastructure/database/locks";
import { env } from "../../config/env";
import { jobs } from "../jobs/jobs.tables";
import { findProfile } from "../profile/profile.repository";
import { workItems, runs, runItems } from "../work/work.tables";
import { assessments } from "./analysis.tables";
import { getSettings, canRequestModel } from "./settings";
import {
  requestAssessment,
  validateAssessment,
  assessmentContext,
} from "./model";
import { assessmentFormatVersion, type WorkItem } from "@surface/contracts";
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
  const job = (
    await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), isNull(jobs.mergedInto)))
      .limit(1)
  )[0];
  if (!job) throw new HttpError(404, "Job not found.");
  const profile = await findProfile();
  if (!profile)
    throw new HttpError(409, "Save your profile before assessing a job.");
  if (!job.currentVersionId)
    throw new HttpError(409, "This job has no description version to assess.");
  const identity = analysisIdentity(job, profile.revision);
  const current = (
    await db
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
      .limit(1)
  )[0];
  if (current) return;
  if (
    activeAssessments.has(id) ||
    (
      await db
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.jobId, id),
            eq(workItems.kind, "analysis"),
            eq(workItems.state, "running"),
          ),
        )
        .limit(1)
    )[0]
  )
    throw new HttpError(409, "An assessment is already running for this job.");
  const settings = await getSettings();
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
  const usageId = await canRequestModel(settings.configured, true);
  if (!usageId)
    throw new HttpError(
      409,
      "AI is busy. Try again when a current request finishes; this assessment has not been queued.",
    );
  activeAssessments.add(id);
  try {
    // A direct click supersedes any old waiting request for this job.
    await db
      .update(workItems)
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
      );
    await syncRuns();
    const result = await requestAssessment(profile, job);
    await transaction(async (tx) => {
      const latestJob = (
        await tx.select().from(jobs).where(eq(jobs.id, id)).limit(1)
      )[0];
      const latestProfile = await findProfile();
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
      await tx
        .insert(assessments)
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
        .onConflictDoNothing();
      await tx
        .update(jobs)
        .set({ analysisRequested: false })
        .where(eq(jobs.id, id));
    });
  } catch (error) {
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

export async function enqueueAnalysis(onlyIds: string[]) {
  if (!onlyIds.length) return null;
  const profile = await findProfile();
  if (!profile)
    throw new HttpError(409, "Save your profile before assessing a job.");
  return await transaction(async (tx) => {
    await lockCoordination(tx, "surface:enqueue-work");
    const now = new Date().toISOString();
    const candidates = await tx
      .select()
      .from(jobs)
      .where(and(inArray(jobs.id, onlyIds), isNull(jobs.mergedInto)));
    if (candidates.length !== new Set(onlyIds).size)
      throw new HttpError(404, "Job not found.");
    let runId: string | null = null;
    for (const job of candidates) {
      if (!job.currentVersionId)
        throw new HttpError(
          409,
          "This job has no description version to assess.",
        );
      const current = (
        await tx
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
          .limit(1)
      )[0];
      if (current) continue;
      const identity = analysisIdentity(job, profile.revision);
      const existing = (
        await tx
          .select()
          .from(workItems)
          .where(eq(workItems.identity, identity))
          .orderBy(desc(workItems.createdAt))
          .limit(1)
      )[0];
      if (existing && ["queued", "running"].includes(existing.state)) continue;
      if (!runId) {
        runId = crypto.randomUUID();
        await tx.insert(runs).values({
          id: runId,
          kind: "analysis",
          label: "Requested assessment",
          state: "queued",
          createdAt: now,
        });
      }
      const id = crypto.randomUUID();
      await tx.insert(workItems).values({
        id,
        kind: "analysis",
        jobId: job.id,
        identity,
        state: "queued",
        retryAt: now,
        createdAt: now,
      });
      await tx.insert(runItems).values({ runId, workId: id });
    }
    return runId ? { runId } : null;
  });
}
export async function executeAnalysis(
  item: WorkItem,
  analyzer = requestAssessment,
  configured = Boolean(env.OMNIROUTE_API_KEY),
) {
  const profile = await findProfile(),
    job = item.jobId
      ? (
          await db.select().from(jobs).where(eq(jobs.id, item.jobId)).limit(1)
        )[0]
      : null;
  const now = new Date().toISOString();
  if (
    !profile ||
    !job ||
    job.mergedInto ||
    item.identity !== analysisIdentity(job, profile.revision)
  ) {
    await db
      .update(workItems)
      .set({
        state: "interrupted",
        error:
          "Job or profile changed before dispatch; queued context is stale.",
        completedAt: now,
      })
      .where(eq(workItems.id, item.id));
    return;
  }
  const reservation = await transaction(async (tx) => {
    const claimed = (
      await tx
        .update(workItems)
        .set({ state: "running", startedAt: now })
        .where(and(eq(workItems.id, item.id), eq(workItems.state, "queued")))
        .returning()
    )[0];
    if (!claimed) return null;
    const usageId = await canRequestModel(configured, true);
    if (!usageId) {
      await tx
        .update(workItems)
        .set({
          state: "queued",
          startedAt: null,
          retryAt: now,
        })
        .where(eq(workItems.id, item.id));
      return null;
    }
    await tx
      .update(workItems)
      .set({ attempts: sql`${workItems.attempts} + 1` })
      .where(eq(workItems.id, item.id));
    return usageId;
  });
  if (!reservation) return;
  try {
    const result = await analyzer(profile, job);
    const output = validateAssessment(
      result.output,
      assessmentContext(profile, job),
    );
    await transaction(async (tx) => {
      const latestJob = (
          await tx.select().from(jobs).where(eq(jobs.id, job.id)).limit(1)
        )[0],
        latestProfile = await findProfile();
      if (
        !latestJob ||
        latestJob.mergedInto ||
        !latestProfile ||
        analysisIdentity(latestJob, latestProfile.revision) !== item.identity
      ) {
        await tx
          .update(workItems)
          .set({
            state: "interrupted",
            error:
              "Discarded stale result: the job or profile changed during analysis.",
            completedAt: new Date().toISOString(),
          })
          .where(eq(workItems.id, item.id));

        return;
      }
      await tx
        .insert(assessments)
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
        .onConflictDoNothing();
      await tx
        .update(jobs)
        .set({ analysisRequested: false })
        .where(eq(jobs.id, job.id));
      await tx
        .update(workItems)
        .set({
          state: "completed",
          error: null,
          result: { assessed: 1 },
          completedAt: new Date().toISOString(),
        })
        .where(eq(workItems.id, item.id));
    });
  } catch (error) {
    const row = (
      await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, item.id))
        .limit(1)
    )[0]!;
    const retry = row.attempts < 3;
    await db
      .update(workItems)
      .set({
        state: retry ? "queued" : "failed",
        retryAt: new Date(Date.now() + 60000 * 2 ** row.attempts).toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Invalid assessment response.",
        completedAt: retry ? null : new Date().toISOString(),
      })
      .where(eq(workItems.id, item.id));
  }
  await syncRuns();
}
