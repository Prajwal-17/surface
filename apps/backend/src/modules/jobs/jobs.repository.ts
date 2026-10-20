import { isAssessmentRunning } from "../analysis/analysis.service";
import { companies } from "../workspace/workspace.tables";
import { companyWebsite } from "./company-website";
import { workspaceRevision } from "../work/events.routes";
import { assessments } from "../analysis/analysis.tables";
import { workItems } from "../work/work.tables";
import { checkEligibility } from "../analysis/eligibility";
import { findProfile } from "../profile/profile.repository";
import { roleMatcher } from "./relevance";
import { assessmentFormatVersion } from "@surface/contracts";
import { createHash } from "node:crypto";
import {
  duplicateDecisions,
  jobVersions,
  observations,
  snapshots,
} from "../collection/collection.tables";
import type {
  Job,
  JobsListQuery,
  JobsListResponse,
  JobStatus,
} from "@surface/contracts";
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
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

export function meaningfulContent(row: {
  title: string;
  company: string;
  location: string;
  description: string;
  employmentType: string | null;
  workMode?: string;
  compensation?: unknown;
  countries?: string[];
}) {
  return {
    title: row.title,
    company: row.company,
    location: row.location,
    description: row.description.replace(/\s+/g, " ").trim(),
    employmentType: row.employmentType,
    workMode: row.workMode ?? "unknown",
    compensation: row.compensation ?? null,
    countries: row.countries ?? [],
  };
}
export function upsertCandidates(candidates: JobCandidate[]): UpsertResult {
  let insertedCount = 0,
    updatedCount = 0;
  db.transaction((tx) => {
    for (const candidate of candidates) {
      const now = new Date().toISOString(),
        canonicalUrl = canonicalizeUrl(candidate.applyUrl),
        sourceRecordKey = createSourceRecordKey(candidate);
      const existingSource = tx
        .select()
        .from(jobSources)
        .where(eq(jobSources.sourceRecordKey, sourceRecordKey))
        .get();
      let existing = existingSource
        ? tx.select().from(jobs).where(eq(jobs.id, existingSource.jobId)).get()
        : tx
            .select()
            .from(jobs)
            .where(
              and(eq(jobs.canonicalUrl, canonicalUrl), isNull(jobs.mergedInto)),
            )
            .get();
      const similar = tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.company, candidate.company),
            eq(jobs.title, candidate.title),
            eq(jobs.location, candidate.location),
            isNull(jobs.mergedInto),
          ),
        )
        .all();
      if (
        !existing &&
        candidate.company !== "Company not listed" &&
        candidate.description.length >= 200
      ) {
        existing = similar.find((row) => {
          if (
            row.companyId &&
            candidate.companyId &&
            row.companyId !== candidate.companyId
          )
            return false;
          if (
            tx
              .select()
              .from(jobSources)
              .where(eq(jobSources.jobId, row.id))
              .all()
              .some(
                (ref) =>
                  new URL(ref.sourceUrl).hostname.replace(/^www\./, "") ===
                  new URL(candidate.sourceUrl).hostname.replace(/^www\./, ""),
              )
          )
            return false;
          return (
            row.description.length >= 200 &&
            createJobFingerprint({
              ...candidate,
              description: row.description,
            }) === createJobFingerprint(candidate)
          );
        });
      }
      const jobId = existing?.id ?? crypto.randomUUID();
      const previousSources = existing
        ? tx.select().from(jobSources).where(eq(jobSources.jobId, jobId)).all()
        : [];
      const authoritative = (source: string) =>
        ["greenhouse", "lever", "ashby", "public-page"].includes(source);
      const preferContent =
        !existing ||
        (authoritative(candidate.source) &&
          !previousSources.some((s) => authoritative(s.source))) ||
        previousSources[0]?.source === candidate.source ||
        existing.canonicalUrl === canonicalUrl;
      // A feed observation cannot overwrite existing employer/ATS content.
      const canUpdate =
        preferContent &&
        !(
          existing &&
          !authoritative(candidate.source) &&
          previousSources.some((s) => authoritative(s.source))
        );
      const fields = {
        canonicalUrl,
        title: candidate.title,
        company: candidate.company,
        companyId: candidate.companyId ?? existing?.companyId ?? null,
        location: candidate.location,
        isRemote: candidate.isRemote,
        workMode:
          candidate.workMode ??
          (candidate.isRemote ? ("remote" as const) : ("unknown" as const)),
        employmentType: candidate.employmentType,
        description: candidate.description,
        descriptionHtml: candidate.descriptionHtml ?? null,
        applyUrl: candidate.applyUrl,
        postedAt: candidate.postedAt,
        compensation: candidate.compensation ?? null,
        countries: candidate.countries ?? [],
        evidence: candidate.evidence ?? [],
      };
      const changed =
        !existing ||
        (canUpdate &&
          JSON.stringify(meaningfulContent(existing)) !==
            JSON.stringify(meaningfulContent(fields)));
      if (existing) {
        tx.update(jobs)
          .set({
            ...(canUpdate ? fields : {}),
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(jobs.id, jobId))
          .run();
        updatedCount++;
      } else {
        tx.insert(jobs)
          .values({
            ...fields,
            id: jobId,
            dedupeKey: sourceRecordKey,
            status: "inbox",
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        insertedCount++;
      }
      const referenceId = existingSource?.id ?? crypto.randomUUID();
      tx.insert(jobSources)
        .values({
          id: referenceId,
          jobId,
          source: candidate.source,
          sourceRecordKey,
          externalId: candidate.externalId,
          sourceUrl: candidate.sourceUrl,
          configuredSourceId: candidate.configuredSourceId ?? null,
          availability: "observed",
          missingChecks: 0,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: jobSources.sourceRecordKey,
          set: {
            jobId,
            sourceUrl: candidate.sourceUrl,
            configuredSourceId:
              candidate.configuredSourceId ??
              existingSource?.configuredSourceId ??
              null,
            lastSeenAt: now,
            availability: "observed",
            missingChecks: 0,
          },
        })
        .run();
      const observationId = crypto.randomUUID();
      tx.insert(observations)
        .values({
          id: observationId,
          jobId,
          sourceReferenceId: referenceId,
          resourceId: candidate.resourceId ?? null,
          snapshotId: candidate.snapshotId ?? null,
          observedAt: now,
          method: candidate.method ?? "legacy-feed",
          evidence: candidate.evidence ?? [],
          incomplete: candidate.incomplete ?? false,
        })
        .run();
      if (changed) {
        const id = crypto.randomUUID(),
          content = meaningfulContent(fields);
        tx.insert(jobVersions)
          .values({
            id,
            jobId,
            content,
            fingerprint: createHash("sha256")
              .update(JSON.stringify(content))
              .digest("hex"),
            createdAt: now,
            observationId,
          })
          .run();
        tx.update(jobs)
          .set({ currentVersionId: id, analysisRequested: false })
          .where(eq(jobs.id, jobId))
          .run();
      }
      if (!existing)
        for (const other of similar) {
          const [leftId, rightId] = [other.id, jobId].toSorted() as [
            string,
            string,
          ];
          tx.insert(duplicateDecisions)
            .values({
              id: `${leftId}:${rightId}`,
              leftId,
              rightId,
              state: "possible",
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .run();
        }
    }
  });
  return { insertedCount, updatedCount };
}

function mapJob(row: typeof jobs.$inferSelect, details = false): Job {
  const refs = db
    .select()
    .from(jobSources)
    .where(eq(jobSources.jobId, row.id))
    .all();
  refs.sort(
    (a, b) =>
      Number(canonicalizeUrl(b.sourceUrl) === row.canonicalUrl) -
        Number(canonicalizeUrl(a.sourceUrl) === row.canonicalUrl) ||
      Number(["greenhouse", "lever", "ashby"].includes(b.source)) -
        Number(["greenhouse", "lever", "ashby"].includes(a.source)),
  );
  const obs = details
    ? db
        .select()
        .from(observations)
        .where(
          inArray(
            observations.sourceReferenceId,
            refs.map((r) => r.id),
          ),
        )
        .all()
    : [];
  const profile = findProfile();
  const history = db
    .select()
    .from(assessments)
    .where(eq(assessments.jobId, row.id))
    .orderBy(desc(assessments.createdAt))
    .all();
  const current = history.find(
    (a) =>
      a.jobVersionId === row.currentVersionId &&
      a.profileRevision === profile?.revision &&
      a.formatVersion === assessmentFormatVersion,
  );
  const latest = db
    .select()
    .from(workItems)
    .where(and(eq(workItems.jobId, row.id), eq(workItems.kind, "analysis")))
    .orderBy(desc(workItems.createdAt))
    .get();
  const assessmentState: Job["assessmentState"] = current
    ? "current"
    : isAssessmentRunning(row.id)
      ? "running"
      : latest && ["queued", "running"].includes(latest.state)
        ? (latest.state as "queued" | "running")
        : latest?.state === "failed"
          ? "failed"
          : history.length
            ? "stale"
            : row.fitScore !== null
              ? "legacy"
              : "not-assessed";
  const fit = current
    ? {
        score: current.output.score,
        verdict:
          current.output.score >= 75
            ? ("strong" as const)
            : current.output.score >= 50
              ? ("possible" as const)
              : ("weak" as const),
        summary: current.output.summary,
        strengths: current.output.strengths.map((s) => s.text),
        concerns: current.output.concerns.map((s) => s.text),
        model: current.model,
        analyzedAt: current.createdAt,
      }
    : row.fitScore !== null &&
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
    companyWebsite: companyWebsite(
      row.companyId
        ? db
            .select({ website: companies.website })
            .from(companies)
            .where(eq(companies.id, row.companyId))
            .get()?.website
        : undefined,
      row.evidence,
      row.description,
    ),
    location: row.location,
    isRemote: row.isRemote,
    employmentType: row.employmentType,
    description: row.description,
    descriptionSummary: row.descriptionSummary,
    applyUrl: row.applyUrl,
    postedAt: row.postedAt,
    status: row.status,
    reviewedAt: row.reviewedAt,
    reviewState: row.reviewedAt ? "reviewed" : "unreviewed",
    sources: [...new Set(refs.map((ref) => ref.source))],
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    fit,
    eligibility: checkEligibility(row, profile?.context ?? null),
    assessment: current ?? history[0] ?? null,
    assessmentHistory: details ? history : [],
    assessmentState,
    companyId: row.companyId,
    descriptionHtml: row.descriptionHtml,
    workMode: row.workMode,
    compensation: row.compensation,
    countries: row.countries,
    evidence: row.evidence,
    currentVersionId: row.currentVersionId,
    availability: refs.some((r) => r.availability === "observed")
      ? "open"
      : refs.length && refs.every((r) => r.availability === "closed")
        ? "closed"
        : "possibly-closed",
    sourceReferences: refs,
    versions: details
      ? db
          .select()
          .from(jobVersions)
          .where(eq(jobVersions.jobId, row.id))
          .orderBy(desc(jobVersions.createdAt))
          .all()
      : [],
    observations: obs.map((o) => ({
      ...o,
      rawAvailable: Boolean(
        o.snapshotId &&
        db
          .select()
          .from(snapshots)
          .where(
            and(eq(snapshots.id, o.snapshotId), isNull(snapshots.removedAt)),
          )
          .get(),
      ),
    })),
    duplicates: details
      ? db
          .select()
          .from(duplicateDecisions)
          .where(
            or(
              eq(duplicateDecisions.leftId, row.id),
              eq(duplicateDecisions.rightId, row.id),
            ),
          )
          .all()
      : [],
  };
}

export function listJobs(input: JobsListQuery): JobsListResponse {
  const conditions: SQL[] = [
    eq(jobs.status, input.status),
    isNull(jobs.mergedInto),
  ];

  if (input.search) {
    const textCondition = or(
      sql`instr(lower(${jobs.title}), lower(${input.search})) > 0`,
      sql`instr(lower(${jobs.company}), lower(${input.search})) > 0`,
      sql`instr(lower(${jobs.location}), lower(${input.search})) > 0`,
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

  if (input.sourceIds)
    conditions.push(
      inArray(
        jobs.id,
        db
          .select({ jobId: jobSources.jobId })
          .from(jobSources)
          .where(
            inArray(jobSources.configuredSourceId, input.sourceIds.split(",")),
          ),
      ),
    );
  if (input.companyId) conditions.push(eq(jobs.companyId, input.companyId));
  if (input.workMode) conditions.push(eq(jobs.workMode, input.workMode));
  if (input.postedAfter)
    conditions.push(sql`${jobs.postedAt} >= ${input.postedAfter}`);
  if (input.discoveredAfter)
    conditions.push(sql`${jobs.firstSeenAt} >= ${input.discoveredAfter}`);
  const where = and(...conditions);
  const matchesRole = roleMatcher(findProfile());
  // ponytail: eligibility is computed from current profile at read time for this local inbox.
  // Materialize indexed eligibility when an inbox grows beyond tens of thousands of jobs.
  let mapped = db
    .select()
    .from(jobs)
    .where(where)
    .orderBy(desc(jobs.firstSeenAt), desc(jobs.id))
    .all()
    .filter(
      (row) =>
        (input.relevance ?? (input.status === "inbox" ? "target" : "all")) ===
          "all" || matchesRole(row),
    )
    .map((row) => mapJob(row));
  mapped = mapped.filter(
    (job) =>
      (!input.reviewState || job.reviewState === input.reviewState) &&
      (!input.eligibility || job.eligibility.state === input.eligibility) &&
      (!input.assessment || job.assessmentState === input.assessment) &&
      (!input.availability || job.availability === input.availability),
  );
  if (input.sort === "best-fit") {
    const priority = (job: Job) =>
      job.eligibility.state === "conflicts"
        ? 4
        : job.assessmentState === "current" && (job.fit?.score ?? 0) >= 50
          ? job.eligibility.state === "meets"
            ? 0
            : 1
          : 2;
    mapped.sort(
      (a, b) =>
        priority(a) - priority(b) ||
        (b.assessmentState === "current" ? (b.fit?.score ?? -1) : -1) -
          (a.assessmentState === "current" ? (a.fit?.score ?? -1) : -1) ||
        b.firstSeenAt.localeCompare(a.firstSeenAt) ||
        a.id.localeCompare(b.id),
    );
  }
  const total = mapped.length;
  return {
    revision: workspaceRevision(),
    jobs: mapped.slice(
      (input.page - 1) * input.limit,
      input.page * input.limit,
    ),
    total,
    collectedTotal: db
      .select({ total: sql<number>`count(*)` })
      .from(jobs)
      .where(isNull(jobs.mergedInto))
      .get()!.total,
    page: input.page,
    limit: input.limit,
    pages: total ? Math.ceil(total / input.limit) : 0,
  };
}

export function findJobById(id: string): Job | null {
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) return null;

  return mapJob(row, true);
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
