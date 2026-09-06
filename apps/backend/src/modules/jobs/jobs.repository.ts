import type {
  Job,
  JobFit,
  JobsListQuery,
  JobsListResponse,
  JobStatus,
  SourceKey,
} from "../../shared/contracts";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import {
  canonicalizeUrl,
  createJobFingerprint,
  createSourceRecordKey,
  type JobCandidate,
} from "../../shared/normalization/job-normalization";
import { jobSources, jobs } from "./jobs.tables";

interface UpsertResult {
  insertedCount: number;
  updatedCount: number;
}

export interface JobForAnalysis {
  id: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  employmentType: string | null;
  description: string;
}

export function upsertCandidates(candidates: JobCandidate[]): UpsertResult {
  let insertedCount = 0;
  let updatedCount = 0;
  const touchedJobIds = new Set<string>();

  db.transaction((transaction) => {
    for (const candidate of candidates) {
      const now = new Date().toISOString();
      const canonicalUrl = canonicalizeUrl(candidate.applyUrl);
      const dedupeKey = createJobFingerprint(candidate);
      const sourceRecordKey = createSourceRecordKey(candidate);

      const existingSource = transaction
        .select({ jobId: jobSources.jobId })
        .from(jobSources)
        .where(eq(jobSources.sourceRecordKey, sourceRecordKey))
        .get();

      const existingJob = existingSource
        ? transaction
            .select()
            .from(jobs)
            .where(eq(jobs.id, existingSource.jobId))
            .get()
        : transaction
            .select()
            .from(jobs)
            .where(
              or(
                eq(jobs.canonicalUrl, canonicalUrl),
                eq(jobs.dedupeKey, dedupeKey),
              ),
            )
            .get();

      let jobId: string;

      if (existingJob) {
        jobId = existingJob.id;
        transaction
          .update(jobs)
          .set({
            dedupeKey,
            canonicalUrl,
            title: candidate.title,
            company: candidate.company,
            location: candidate.location,
            isRemote: candidate.isRemote,
            employmentType: candidate.employmentType,
            description: candidate.description,
            applyUrl: candidate.applyUrl,
            postedAt: candidate.postedAt,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(jobs.id, jobId))
          .run();

        if (!touchedJobIds.has(jobId)) updatedCount += 1;
      } else {
        jobId = crypto.randomUUID();
        transaction
          .insert(jobs)
          .values({
            id: jobId,
            dedupeKey,
            canonicalUrl,
            title: candidate.title,
            company: candidate.company,
            location: candidate.location,
            isRemote: candidate.isRemote,
            employmentType: candidate.employmentType,
            description: candidate.description,
            applyUrl: candidate.applyUrl,
            postedAt: candidate.postedAt,
            status: "inbox",
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        insertedCount += 1;
      }

      touchedJobIds.add(jobId);

      transaction
        .insert(jobSources)
        .values({
          id: crypto.randomUUID(),
          jobId,
          source: candidate.source,
          sourceRecordKey,
          externalId: candidate.externalId,
          sourceUrl: candidate.sourceUrl,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: jobSources.sourceRecordKey,
          set: {
            jobId,
            externalId: candidate.externalId,
            sourceUrl: candidate.sourceUrl,
            lastSeenAt: now,
          },
        })
        .run();
    }
  });

  return { insertedCount, updatedCount };
}

function mapJob(row: typeof jobs.$inferSelect, sources: SourceKey[]): Job {
  const fit =
    row.fitScore !== null &&
    row.fitVerdict !== null &&
    row.fitSummary !== null &&
    row.fitModel !== null &&
    row.fitAnalyzedAt !== null
      ? {
          score: row.fitScore,
          verdict: row.fitVerdict,
          summary: row.fitSummary,
          strengths: row.fitStrengths ?? [],
          concerns: row.fitConcerns ?? [],
          model: row.fitModel,
          analyzedAt: row.fitAnalyzedAt,
        }
      : null;

  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    isRemote: row.isRemote,
    employmentType: row.employmentType,
    description: row.description,
    applyUrl: row.applyUrl,
    postedAt: row.postedAt,
    status: row.status,
    sources,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    fit,
  };
}

export function listJobs(input: JobsListQuery): JobsListResponse {
  const conditions: SQL[] = [eq(jobs.status, input.status)];

  if (input.search) {
    const pattern = `%${input.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const textCondition = or(
      like(jobs.title, pattern),
      like(jobs.company, pattern),
      like(jobs.location, pattern),
    );
    if (textCondition) conditions.push(textCondition);
  }

  if (input.source) {
    conditions.push(
      inArray(
        jobs.id,
        db
          .select({ jobId: jobSources.jobId })
          .from(jobSources)
          .where(eq(jobSources.source, input.source)),
      ),
    );
  }

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const query = db.select().from(jobs).where(where);
  const rows = (
    input.status === "inbox"
      ? query.orderBy(
          sql`${jobs.fitScore} is null`,
          desc(jobs.fitScore),
          desc(jobs.postedAt),
          desc(jobs.firstSeenAt),
        )
      : query.orderBy(desc(jobs.postedAt), desc(jobs.firstSeenAt))
  )
    .limit(input.limit)
    .offset(offset)
    .all();

  const total =
    db.select({ total: count() }).from(jobs).where(where).get()?.total ?? 0;

  const sourceRows = rows.length
    ? db
        .select({ jobId: jobSources.jobId, source: jobSources.source })
        .from(jobSources)
        .where(
          inArray(
            jobSources.jobId,
            rows.map((row) => row.id),
          ),
        )
        .all()
    : [];

  const sourcesByJob = new Map<string, SourceKey[]>();
  for (const sourceRow of sourceRows) {
    const current = sourcesByJob.get(sourceRow.jobId) ?? [];
    if (!current.includes(sourceRow.source)) current.push(sourceRow.source);
    sourcesByJob.set(sourceRow.jobId, current);
  }

  return {
    jobs: rows.map((row) => mapJob(row, sourcesByJob.get(row.id) ?? [])),
    total,
    page: input.page,
    limit: input.limit,
    pages: total === 0 ? 0 : Math.ceil(total / input.limit),
  };
}

export function findJobById(id: string): Job | null {
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) return null;

  const sources = db
    .select({ source: jobSources.source })
    .from(jobSources)
    .where(eq(jobSources.jobId, id))
    .all()
    .map((item) => item.source);

  return mapJob(row, [...new Set(sources)]);
}

export function setJobStatus(id: string, status: JobStatus): Job | null {
  const existing = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, id))
    .get();
  if (!existing) return null;

  db.update(jobs)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(jobs.id, id))
    .run();

  return findJobById(id);
}

export function listJobsForAnalysis(limit: number): JobForAnalysis[] {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      isRemote: jobs.isRemote,
      employmentType: jobs.employmentType,
      description: jobs.description,
    })
    .from(jobs)
    .where(and(eq(jobs.status, "inbox"), isNull(jobs.fitScore)))
    .orderBy(desc(jobs.postedAt), desc(jobs.firstSeenAt))
    .limit(limit)
    .all();
}

export function saveJobFit(id: string, fit: JobFit): void {
  db.update(jobs)
    .set({
      fitScore: fit.score,
      fitVerdict: fit.verdict,
      fitSummary: fit.summary,
      fitStrengths: fit.strengths,
      fitConcerns: fit.concerns,
      fitModel: fit.model,
      fitAnalyzedAt: fit.analyzedAt,
    })
    .where(eq(jobs.id, id))
    .run();
}

export function countJobsForAnalysis(): number {
  return (
    db
      .select({ total: count() })
      .from(jobs)
      .where(and(eq(jobs.status, "inbox"), isNull(jobs.fitScore)))
      .get()?.total ?? 0
  );
}
