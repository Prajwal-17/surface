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
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  db,
  runTransaction,
  type Database,
  type Transaction,
} from "../../infrastructure/database/client";
import { lockCoordination } from "../../infrastructure/database/locks";
import {
  containsText,
  countAsInteger,
} from "../../infrastructure/database/sql-helpers";
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
export async function upsertCandidates(
  candidates: JobCandidate[],
  connection: Database | Transaction = db,
): Promise<UpsertResult> {
  let insertedCount = 0,
    updatedCount = 0;
  await runTransaction(connection, async (tx) => {
    await lockCoordination(tx, "surface:job-upsert");
    for (const candidate of candidates) {
      const now = new Date().toISOString(),
        canonicalUrl = canonicalizeUrl(candidate.applyUrl),
        sourceRecordKey = createSourceRecordKey(candidate);
      const existingSource = (
        await tx
          .select()
          .from(jobSources)
          .where(eq(jobSources.sourceRecordKey, sourceRecordKey))
          .limit(1)
      )[0];
      let existing = existingSource
        ? (
            await tx
              .select()
              .from(jobs)
              .where(eq(jobs.id, existingSource.jobId))
              .limit(1)
          )[0]
        : (
            await tx
              .select()
              .from(jobs)
              .where(
                and(
                  eq(jobs.canonicalUrl, canonicalUrl),
                  isNull(jobs.mergedInto),
                ),
              )
              .limit(1)
          )[0];
      const similar = await tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.company, candidate.company),
            eq(jobs.title, candidate.title),
            eq(jobs.location, candidate.location),
            isNull(jobs.mergedInto),
          ),
        );
      if (
        !existing &&
        candidate.company !== "Company not listed" &&
        candidate.description.length >= 200
      ) {
        const matches = async (row: typeof jobs.$inferSelect) => {
          if (
            row.companyId &&
            candidate.companyId &&
            row.companyId !== candidate.companyId
          )
            return false;
          if (
            (
              await tx
                .select()
                .from(jobSources)
                .where(eq(jobSources.jobId, row.id))
            ).some(
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
        };
        for (const row of similar) {
          if (await matches(row)) {
            existing = row;
            break;
          }
        }
      }
      const jobId = existing?.id ?? crypto.randomUUID();
      const previousSources = existing
        ? await tx.select().from(jobSources).where(eq(jobSources.jobId, jobId))
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
        await tx
          .update(jobs)
          .set({
            ...(canUpdate ? fields : {}),
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(jobs.id, jobId));
        updatedCount++;
      } else {
        await tx.insert(jobs).values({
          ...fields,
          id: jobId,
          dedupeKey: sourceRecordKey,
          status: "inbox",
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        });
        insertedCount++;
      }
      const referenceId = existingSource?.id ?? crypto.randomUUID();
      await tx
        .insert(jobSources)
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
        });
      const observationId = crypto.randomUUID();
      await tx.insert(observations).values({
        id: observationId,
        jobId,
        sourceReferenceId: referenceId,
        resourceId: candidate.resourceId ?? null,
        snapshotId: candidate.snapshotId ?? null,
        observedAt: now,
        method: candidate.method ?? "legacy-feed",
        evidence: candidate.evidence ?? [],
        incomplete: candidate.incomplete ?? false,
      });
      if (changed) {
        const id = crypto.randomUUID(),
          content = meaningfulContent(fields);
        await tx.insert(jobVersions).values({
          id,
          jobId,
          content,
          fingerprint: createHash("sha256")
            .update(JSON.stringify(content))
            .digest("hex"),
          createdAt: now,
          observationId,
        });
        await tx
          .update(jobs)
          .set({ currentVersionId: id, analysisRequested: false })
          .where(eq(jobs.id, jobId));
      }
      if (!existing)
        for (const other of similar) {
          const [leftId, rightId] = [other.id, jobId].toSorted() as [
            string,
            string,
          ];
          await tx
            .insert(duplicateDecisions)
            .values({
              id: `${leftId}:${rightId}`,
              leftId,
              rightId,
              state: "possible",
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing();
        }
    }
  });
  return { insertedCount, updatedCount };
}

async function jobReadContext(rows: (typeof jobs.$inferSelect)[]) {
  const ids = rows.map((row) => row.id);
  const [profile, sources, history, pending, companyRows] = await Promise.all([
    findProfile(),
    ids.length
      ? db.select().from(jobSources).where(inArray(jobSources.jobId, ids))
      : [],
    ids.length
      ? db
          .select()
          .from(assessments)
          .where(inArray(assessments.jobId, ids))
          .orderBy(desc(assessments.createdAt))
      : [],
    ids.length
      ? db
          .select()
          .from(workItems)
          .where(
            and(inArray(workItems.jobId, ids), eq(workItems.kind, "analysis")),
          )
          .orderBy(desc(workItems.createdAt))
      : [],
    db.select().from(companies),
  ]);
  const group = <T extends { jobId: string }>(items: T[]) => {
    const result = new Map<string, T[]>();
    for (const item of items) {
      const bucket = result.get(item.jobId) ?? [];
      bucket.push(item);
      result.set(item.jobId, bucket);
    }
    return result;
  };
  const latestWork = new Map<string, typeof workItems.$inferSelect>();
  for (const item of pending)
    if (item.jobId && !latestWork.has(item.jobId))
      latestWork.set(item.jobId, item);
  return {
    profile,
    sources: group(sources),
    history: group(history),
    latestWork,
    companies: new Map(companyRows.map((c) => [c.id, c])),
  };
}

async function mapJob(
  row: typeof jobs.$inferSelect,
  details = false,
  context?: Awaited<ReturnType<typeof jobReadContext>>,
): Promise<Job> {
  context ??= await jobReadContext([row]);
  const refs = context.sources.get(row.id) ?? [];
  refs.sort(
    (a, b) =>
      Number(canonicalizeUrl(b.sourceUrl) === row.canonicalUrl) -
        Number(canonicalizeUrl(a.sourceUrl) === row.canonicalUrl) ||
      Number(["greenhouse", "lever", "ashby"].includes(b.source)) -
        Number(["greenhouse", "lever", "ashby"].includes(a.source)),
  );
  const obs = details
    ? await db
        .select()
        .from(observations)
        .where(
          inArray(
            observations.sourceReferenceId,
            refs.map((r) => r.id),
          ),
        )
    : [];
  const profile = context.profile;
  const history = context.history.get(row.id) ?? [];
  const current = history.find(
    (a) =>
      a.jobVersionId === row.currentVersionId &&
      a.profileRevision === profile?.revision &&
      a.formatVersion === assessmentFormatVersion,
  );
  const latest = context.latestWork.get(row.id);
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
      row.companyId ? context.companies.get(row.companyId)?.website : undefined,
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
      ? await db
          .select()
          .from(jobVersions)
          .where(eq(jobVersions.jobId, row.id))
          .orderBy(desc(jobVersions.createdAt))
      : [],
    observations: await Promise.all(
      obs.map(async (o) => ({
        ...o,
        rawAvailable: Boolean(
          o.snapshotId &&
          (
            await db
              .select()
              .from(snapshots)
              .where(
                and(
                  eq(snapshots.id, o.snapshotId),
                  isNull(snapshots.removedAt),
                ),
              )
              .limit(1)
          )[0],
        ),
      })),
    ),
    duplicates: details
      ? await db
          .select()
          .from(duplicateDecisions)
          .where(
            or(
              eq(duplicateDecisions.leftId, row.id),
              eq(duplicateDecisions.rightId, row.id),
            ),
          )
      : [],
  };
}

export async function listJobs(
  input: JobsListQuery,
): Promise<JobsListResponse> {
  const conditions: SQL[] = [
    eq(jobs.status, input.status),
    isNull(jobs.mergedInto),
  ];

  if (input.search) {
    const textCondition = or(
      containsText(jobs.title, input.search),
      containsText(jobs.company, input.search),
      containsText(jobs.location, input.search),
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
  // Large posting bodies are only needed for the displayed page, not inbox filters.
  const rows = await db
    .select({
      ...getTableColumns(jobs),
      description: sql<string>`''`.as("description"),
      descriptionHtml: sql<string | null>`NULL`.as("description_html"),
      descriptionSummary: sql<
        (typeof jobs.$inferSelect)["descriptionSummary"]
      >`NULL`.as("description_summary"),
    })
    .from(jobs)
    .where(where)
    .orderBy(desc(jobs.firstSeenAt), desc(jobs.id));
  // Load related rows once: the inbox evaluates eligibility and filters before pagination.
  const context = await jobReadContext(rows);
  const matchesRole = roleMatcher(context.profile);
  let mapped = await Promise.all(
    rows
      .filter(
        (row) =>
          (input.relevance ?? (input.status === "inbox" ? "target" : "all")) ===
            "all" || matchesRole(row),
      )
      .map((row) => mapJob(row, false, context)),
  );
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
  const page = mapped.slice(
    (input.page - 1) * input.limit,
    input.page * input.limit,
  );
  const fullRows = page.length
    ? await db
        .select()
        .from(jobs)
        .where(
          inArray(
            jobs.id,
            page.map((job) => job.id),
          ),
        )
    : [];
  const byId = new Map(fullRows.map((row) => [row.id, row]));
  return {
    revision: await workspaceRevision(),
    jobs: await Promise.all(
      page
        .filter((job) => byId.has(job.id))
        .map((job) => mapJob(byId.get(job.id)!, false, context)),
    ),
    total,
    collectedTotal: (
      await db
        .select({ total: countAsInteger() })
        .from(jobs)
        .where(isNull(jobs.mergedInto))
        .limit(1)
    )[0]!.total,
    page: input.page,
    limit: input.limit,
    pages: total ? Math.ceil(total / input.limit) : 0,
  };
}

export async function findJobById(id: string): Promise<Job | null> {
  const row = (await db.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
  if (!row) return null;

  return await mapJob(row, true);
}

export async function setJobStatus(
  id: string,
  status: JobStatus,
): Promise<Job | null> {
  const existing = (
    await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1)
  )[0];
  if (!existing) return null;

  await db
    .update(jobs)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(jobs.id, id));

  return await findJobById(id);
}
