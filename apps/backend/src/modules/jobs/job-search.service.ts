import { and, desc, eq, isNull } from "drizzle-orm";
import {
  jobSearchSettingsInputSchema,
  jobSearchSourceResultSchema,
  jobSearchRunSchema,
  jobSearchSettingsSchema,
  sourceLabels,
  type JobSearchRun,
  type JobSearchSettingsInput,
} from "@surface/contracts";
import { sourceAdapters } from "../discovery/sources";
import { fetchPublic } from "../collection/public-http";
import {
  db,
  transaction,
  type Database,
  type Transaction,
} from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";
import {
  canonicalizeUrl,
  normalizeCandidate,
  type JobCandidate,
} from "../../shared/normalization/job-normalization";
import { applications } from "../applications/applications.tables";
import { companies } from "../workspace/workspace.tables";
import { normalizedName, websiteIdentity } from "../company-discovery/identity";
import {
  jobSearchRuns,
  jobSearchSeen,
  jobSearchSettings,
} from "./job-search.tables";

const FEEDS = [
  {
    key: "remotive",
    label: sourceLabels.remotive,
    url: "https://remotive.com/api/remote-jobs",
    json: true,
  },
  {
    key: "jobicy",
    label: sourceLabels.jobicy,
    url: "https://jobicy.com/api/v2/remote-jobs",
    json: true,
  },
  {
    key: "arbeitnow",
    label: sourceLabels.arbeitnow,
    url: "https://www.arbeitnow.com/api/job-board-api",
    json: true,
  },
  {
    key: "remote-ok",
    label: sourceLabels["remote-ok"],
    url: "https://remoteok.com/api",
    json: true,
  },
  {
    key: "we-work-remotely",
    label: sourceLabels["we-work-remotely"],
    url: "https://weworkremotely.com/remote-jobs.rss",
    json: false,
  },
] as const;
type SourceResult = JobSearchRun["sources"][number];
let activeRun: Promise<JobSearchRun> | null = null;

function nextRunAt(
  enabled: boolean,
  intervalMinutes: number,
  after = Date.now(),
) {
  return enabled && intervalMinutes > 0
    ? new Date(after + intervalMinutes * 60_000).toISOString()
    : null;
}

async function ensureSettings() {
  let [row] = await db
    .select()
    .from(jobSearchSettings)
    .where(eq(jobSearchSettings.id, "default"))
    .limit(1);
  if (!row) {
    const now = new Date().toISOString();
    [row] = await db
      .insert(jobSearchSettings)
      .values({ id: "default", updatedAt: now })
      .returning();
  }
  return row!;
}

async function getLatestRun() {
  const [row] = await db
    .select()
    .from(jobSearchRuns)
    .orderBy(desc(jobSearchRuns.startedAt))
    .limit(1);
  return row ? jobSearchRunSchema.parse(row) : null;
}

export async function getJobSearchSettings() {
  const [settings, latestRun] = await Promise.all([
    ensureSettings(),
    getLatestRun(),
  ]);
  return jobSearchSettingsSchema.parse({
    query: settings.query,
    location: settings.location,
    employmentType: settings.employmentType,
    remoteOnly: settings.remoteOnly,
    intervalMinutes: settings.intervalMinutes,
    maxApplications: settings.maxApplications,
    maxCompanies: settings.maxCompanies,
    enabled: settings.enabled,
    lastRunAt: settings.lastRunAt,
    nextRunAt: settings.nextRunAt,
    latestRun,
    running: Boolean(settings.runningRunId),
  });
}

export async function saveJobSearchSettings(input: JobSearchSettingsInput) {
  const parsed = jobSearchSettingsInputSchema.parse(input);
  const now = new Date().toISOString();
  await ensureSettings();
  await db
    .update(jobSearchSettings)
    .set({
      ...parsed,
      nextRunAt: nextRunAt(parsed.enabled, parsed.intervalMinutes),
      updatedAt: now,
    })
    .where(eq(jobSearchSettings.id, "default"));
  return getJobSearchSettings();
}

export async function recoverInterruptedJobSearch() {
  const settings = await ensureSettings();
  if (!settings.runningRunId) return;
  const now = new Date().toISOString();
  await transaction(async (tx) => {
    await tx
      .update(jobSearchRuns)
      .set({ status: "failed", completedAt: now })
      .where(eq(jobSearchRuns.id, settings.runningRunId!));
    await tx
      .update(jobSearchSettings)
      .set({
        runningRunId: null,
        lastRunAt: now,
        nextRunAt: nextRunAt(
          settings.enabled,
          settings.intervalMinutes,
          Date.parse(now),
        ),
        updatedAt: now,
      })
      .where(eq(jobSearchSettings.id, "default"));
  });
}

function canonicalEmploymentType(value: string | null) {
  const normalized = (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (["fulltime", "fulltimeemployee"].includes(normalized)) return "full-time";
  if (normalized === "parttime") return "part-time";
  if (["contract", "contractor", "freelance"].includes(normalized))
    return "contract";
  if (["intern", "internship"].includes(normalized)) return "internship";
  if (["temporary", "temp"].includes(normalized)) return "temporary";
  return normalized;
}

function matches(candidate: JobCandidate, settings: JobSearchSettingsInput) {
  const terms = settings.query.toLowerCase().split(/\s+/).filter(Boolean);
  const roleText =
    `${candidate.title} ${candidate.tags.join(" ")} ${candidate.description}`.toLowerCase();
  if (terms.some((term) => !roleText.includes(term))) return false;
  if (settings.remoteOnly && !candidate.isRemote) return false;
  if (settings.location) {
    const target = settings.location.toLowerCase();
    const locationMatch =
      candidate.location.toLowerCase().includes(target) ||
      candidate.countries?.some((country) =>
        country.toLowerCase().includes(target),
      );
    const globalRemote =
      candidate.isRemote &&
      /\b(remote|worldwide|anywhere|global|all countries)\b/i.test(
        candidate.location,
      ) &&
      !candidate.countries?.length;
    if (!locationMatch && !globalRemote) return false;
  }
  if (
    settings.employmentType !== "any" &&
    canonicalEmploymentType(candidate.employmentType) !==
      settings.employmentType
  )
    return false;
  return true;
}

async function fetchFeed(
  feed: (typeof FEEDS)[number],
  settings: JobSearchSettingsInput,
  fetcher: (input: string) => Promise<{ body: string }>,
) {
  const response = await fetcher(feed.url);
  const payload = feed.json ? JSON.parse(response.body) : response.body;
  const adapter = sourceAdapters.find((item) => item.key === feed.key);
  if (!adapter) throw new Error(`No adapter registered for ${feed.label}.`);
  const extracted = adapter.extract(payload);
  const candidates = extracted.jobs
    .map((candidate) => normalizeCandidate(candidate))
    .filter((candidate) => matches(candidate, settings));
  return { fetched: extracted.fetchedCount, candidates };
}

function companyIdentity(candidate: JobCandidate) {
  const name = candidate.company.trim();
  const nameIdentity = normalizedName(name);
  if (
    !nameIdentity ||
    [
      "company",
      "company not listed",
      "confidential",
      "confidential company",
      "employer",
      "n a",
      "not disclosed",
      "not provided",
      "stealth",
      "stealth startup",
      "undisclosed",
      "unknown",
      "unknown co",
      "unknown company",
    ].includes(nameIdentity)
  )
    return null;
  let website: string | null = null;
  let domain: string | null = null;
  if (candidate.companyWebsite) {
    try {
      const parsed = new URL(candidate.companyWebsite);
      if (["http:", "https:"].includes(parsed.protocol)) {
        domain = websiteIdentity(parsed.href);
        if (domain) website = `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // An invalid company URL is not a usable identity.
    }
  }
  return { name, normalizedName: nameIdentity, website, domain };
}

async function findOrCreateCompany(
  candidate: JobCandidate,
  remainingCompanySlots: number,
  now: string,
  connection: Database | Transaction = db,
) {
  const identity = companyIdentity(candidate);
  if (!identity)
    return {
      company: null,
      created: false,
      skippedAs: "unresolvedCompany" as const,
    };
  if (identity.domain) {
    const byDomain = await connection
      .select()
      .from(companies)
      .where(eq(companies.normalizedWebsite, identity.domain))
      .limit(2);
    if (byDomain.length === 1) return { company: byDomain[0]!, created: false };
    if (byDomain.length > 1)
      return {
        company: null,
        created: false,
        skippedAs: "unresolvedCompany" as const,
      };
  }
  const byName = (await connection.select().from(companies)).filter(
    (company) => normalizedName(company.name) === identity.normalizedName,
  );
  if (byName.length === 1) {
    const existing = byName[0]!;
    const existingDomain = websiteIdentity(existing.website);
    if (identity.domain && existingDomain && existingDomain !== identity.domain)
      return {
        company: null,
        created: false,
        skippedAs: "unresolvedCompany" as const,
      };
    return { company: existing, created: false };
  }
  if (byName.length > 1)
    return {
      company: null,
      created: false,
      skippedAs: "unresolvedCompany" as const,
    };
  if (remainingCompanySlots <= 0)
    return {
      company: null,
      created: false,
      skippedAs: "companyLimit" as const,
    };
  const [created] = await connection
    .insert(companies)
    .values({
      id: crypto.randomUUID(),
      name: identity.name,
      website: identity.website ?? "",
      normalizedWebsite: identity.domain,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { company: created ?? null, created: Boolean(created) };
}

async function insertAccepted(
  candidates: JobCandidate[],
  settings: JobSearchSettingsInput,
  runId: string,
) {
  let insertedApplications = 0;
  let insertedCompanies = 0;
  const skippedBySource = new Map<string, SourceResult>();
  const countSkip = (
    candidate: JobCandidate,
    reason:
      | "skippedDuplicates"
      | "skippedUnresolvedCompanies"
      | "skippedCompanyLimit"
      | "skippedApplicationLimit",
  ) => {
    const current = skippedBySource.get(candidate.source) ?? {
      key: candidate.source as SourceResult["key"],
      label: sourceLabels[candidate.source as keyof typeof sourceLabels],
      fetched: 0,
      matched: 0,
      error: null,
      skippedDuplicates: 0,
      skippedUnresolvedCompanies: 0,
      skippedCompanyLimit: 0,
      skippedApplicationLimit: 0,
    };
    skippedBySource.set(candidate.source, {
      ...current,
      [reason]: current[reason] + 1,
    });
  };
  const now = new Date().toISOString();
  const existingApplications = await db
    .select({ sourceUrl: applications.sourceUrl })
    .from(applications)
    .where(isNull(applications.archivedAt));
  const existingUrls = new Set(
    existingApplications.flatMap((application) => {
      if (!application.sourceUrl) return [];
      try {
        return [canonicalizeUrl(application.sourceUrl)];
      } catch {
        return [];
      }
    }),
  );
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const canonicalUrl = canonicalizeUrl(candidate.applyUrl);
    const canonicalPostingUrl = canonicalizeUrl(candidate.sourceUrl);
    if (
      existingUrls.has(canonicalUrl) ||
      existingUrls.has(canonicalPostingUrl)
    ) {
      countSkip(candidate, "skippedDuplicates");
      continue;
    }
    const saved = await transaction(async (tx) => {
      const [seen] = await tx
        .select({ id: jobSearchSeen.id })
        .from(jobSearchSeen)
        .where(eq(jobSearchSeen.canonicalUrl, canonicalUrl))
        .limit(1);
      if (seen) return { skippedAs: "duplicate" as const };
      const resolution = await findOrCreateCompany(
        candidate,
        settings.maxCompanies - insertedCompanies,
        now,
        tx,
      );
      if (!resolution.company)
        return { skippedAs: resolution.skippedAs ?? "unresolvedCompany" };
      const [application] = await tx
        .insert(applications)
        .values({
          id: crypto.randomUUID(),
          companyId: resolution.company.id,
          companyName: resolution.company.name,
          title: candidate.title,
          sourceUrl: candidate.originalPostingUrl ?? candidate.sourceUrl,
          description: candidate.description || null,
          publishedAt: candidate.postedAt,
          location: candidate.location,
          employmentType: candidate.employmentType,
          workMode:
            candidate.workMode ?? (candidate.isRemote ? "remote" : "unknown"),
          compensation: candidate.compensation ?? null,
          status: "queued",
          notes: "",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!application) throw new Error("Could not save the matched posting.");
      await tx.insert(jobSearchSeen).values({
        id: crypto.randomUUID(),
        canonicalUrl,
        source: candidate.source,
        applicationId: application.id,
        firstSeenAt: now,
      });
      return { createdCompany: resolution.created };
    });
    if ("skippedAs" in saved) {
      countSkip(
        candidate,
        saved.skippedAs === "duplicate"
          ? "skippedDuplicates"
          : saved.skippedAs === "companyLimit"
            ? "skippedCompanyLimit"
            : "skippedUnresolvedCompanies",
      );
      continue;
    }
    if (saved.createdCompany) insertedCompanies++;
    existingUrls.add(canonicalUrl);
    existingUrls.add(canonicalPostingUrl);
    insertedApplications++;
    if (insertedApplications >= settings.maxApplications) {
      for (const pending of candidates.slice(index + 1))
        countSkip(pending, "skippedApplicationLimit");
      break;
    }
  }
  const skipped = [...skippedBySource.values()].reduce(
    (total, source) =>
      total +
      source.skippedDuplicates +
      source.skippedUnresolvedCompanies +
      source.skippedCompanyLimit +
      source.skippedApplicationLimit,
    0,
  );
  await db
    .update(jobSearchRuns)
    .set({ insertedApplications, insertedCompanies, skipped })
    .where(eq(jobSearchRuns.id, runId));
  return { insertedApplications, insertedCompanies, skipped, skippedBySource };
}

async function runNow(fetcher: (input: string) => Promise<{ body: string }>) {
  await ensureSettings();
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  const claimedSettings = await transaction(async (tx) => {
    const [row] = await tx
      .update(jobSearchSettings)
      .set({ runningRunId: runId, updatedAt: startedAt })
      .where(
        and(
          eq(jobSearchSettings.id, "default"),
          isNull(jobSearchSettings.runningRunId),
        ),
      )
      .returning();
    if (!row) return null;
    await tx.insert(jobSearchRuns).values({
      id: runId,
      status: "completed",
      startedAt,
      completedAt: startedAt,
      sources: [],
      found: 0,
    });
    return row;
  });
  if (!claimedSettings)
    throw new HttpError(409, "A job search is already running.");
  const settings = jobSearchSettingsInputSchema.parse(claimedSettings);
  try {
    const feedResults = await Promise.all(
      FEEDS.map(async (feed) => {
        try {
          const fetched = await fetchFeed(feed, settings, fetcher);
          return {
            result: jobSearchSourceResultSchema.parse({
              key: feed.key,
              label: feed.label,
              fetched: fetched.fetched,
              matched: fetched.candidates.length,
              error: null,
            }),
            candidates: fetched.candidates,
          };
        } catch (error) {
          return {
            result: jobSearchSourceResultSchema.parse({
              key: feed.key,
              label: feed.label,
              fetched: 0,
              matched: 0,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not read this feed.",
            }),
            candidates: [] as JobCandidate[],
          };
        }
      }),
    );
    const results = feedResults.map((result) => result.result);
    const failures = results.filter((result) => result.error);
    const candidateByUrl = new Map<string, JobCandidate>();
    for (const result of feedResults) {
      for (const candidate of result.candidates) {
        const key = canonicalizeUrl(candidate.applyUrl);
        if (!candidateByUrl.has(key)) candidateByUrl.set(key, candidate);
      }
    }
    const candidates = [...candidateByUrl.values()].toSorted((a, b) =>
      (b.postedAt ?? "").localeCompare(a.postedAt ?? ""),
    );
    const { skippedBySource, ...resultCounts } = await insertAccepted(
      candidates,
      settings,
      runId,
    );
    const sources = results.map((source) => {
      const skipped = skippedBySource.get(source.key);
      return skipped
        ? {
            ...source,
            skippedDuplicates: skipped.skippedDuplicates,
            skippedUnresolvedCompanies: skipped.skippedUnresolvedCompanies,
            skippedCompanyLimit: skipped.skippedCompanyLimit,
            skippedApplicationLimit: skipped.skippedApplicationLimit,
          }
        : source;
    });
    const completedAt = new Date().toISOString();
    const status =
      failures.length === FEEDS.length
        ? "failed"
        : failures.length
          ? "partial"
          : "completed";
    const run = jobSearchRunSchema.parse({
      id: runId,
      status,
      startedAt,
      completedAt,
      found: candidates.length,
      ...resultCounts,
      sources,
    });
    await transaction(async (tx) => {
      const [currentSettings] = await tx
        .select()
        .from(jobSearchSettings)
        .where(eq(jobSearchSettings.id, "default"))
        .limit(1);
      await tx
        .update(jobSearchRuns)
        .set(run)
        .where(eq(jobSearchRuns.id, runId));
      await tx
        .update(jobSearchSettings)
        .set({
          runningRunId: null,
          lastRunAt: completedAt,
          nextRunAt: nextRunAt(
            currentSettings?.enabled ?? settings.enabled,
            currentSettings?.intervalMinutes ?? settings.intervalMinutes,
            Date.parse(completedAt),
          ),
          updatedAt: completedAt,
        })
        .where(eq(jobSearchSettings.id, "default"));
    });
    return run;
  } catch (error) {
    const completedAt = new Date().toISOString();
    await transaction(async (tx) => {
      const [currentSettings] = await tx
        .select()
        .from(jobSearchSettings)
        .where(eq(jobSearchSettings.id, "default"))
        .limit(1);
      await tx
        .update(jobSearchRuns)
        .set({ status: "failed", completedAt })
        .where(eq(jobSearchRuns.id, runId));
      await tx
        .update(jobSearchSettings)
        .set({
          runningRunId: null,
          lastRunAt: completedAt,
          nextRunAt: nextRunAt(
            currentSettings?.enabled ?? settings.enabled,
            currentSettings?.intervalMinutes ?? settings.intervalMinutes,
            Date.parse(completedAt),
          ),
          updatedAt: completedAt,
        })
        .where(eq(jobSearchSettings.id, "default"));
    });
    throw error;
  }
}

export async function runJobSearch(
  fetcher: (input: string) => Promise<{ body: string }> = fetchPublic,
) {
  if (activeRun) throw new HttpError(409, "A job search is already running.");
  activeRun = runNow(fetcher);
  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
}

export async function runDueJobSearch(
  now = new Date(),
  fetcher: (input: string) => Promise<{ body: string }> = fetchPublic,
) {
  if (activeRun) return;
  const settings = await ensureSettings();
  if (
    !settings.enabled ||
    settings.intervalMinutes <= 0 ||
    !settings.nextRunAt ||
    Date.parse(settings.nextRunAt) > now.getTime() ||
    settings.runningRunId
  )
    return;
  activeRun = runNow(fetcher);
  try {
    await activeRun;
  } catch (error) {
    console.error("Scheduled job search failed", error);
  } finally {
    activeRun = null;
  }
}
