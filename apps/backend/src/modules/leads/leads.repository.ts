import { and, desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { executeStatement } from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";
import {
  companyTags,
  discoveryRunEvents,
  discoveryRuns,
  leadEvidence,
  leadSettings,
  leadSources,
  researchBriefs,
  type DiscoveryRun,
  type DiscoveryRunEvent,
  type LeadEvidence,
  type LeadSettings,
  type LeadSource,
  type ResearchBrief,
} from "./leads.tables";

import {
  normalizeDiscoveryCriteria,
  type DiscoveryCriteria,
  type ResearchCriteria,
  type RunCriteria,
} from "@surface/contracts";

export type {
  DiscoveryCriteria,
  ResearchCriteria,
  RunCriteria,
  SeedSource,
} from "@surface/contracts";

export type CompanyTag = "lead" | "research";
export const COMPANY_TAGS: readonly CompanyTag[] = ["lead", "research"];

export type RunState =
  "queued" | "running" | "completed" | "failed" | "cancelled";

export type RunKind = "discovery" | "research";

export type ResearchFinding = {
  claim: string;
  sourceIds: string[];
};

export type ResearchSource = {
  id: string;
  url: string;
  title: string;
  retrievedAt: string;
  excerpt: string;
};

export type CompanySummary = {
  id: string;
  name: string;
  website: string;
  location: string;
  description: string;
  notes: string;
  status: string;
  tags: CompanyTag[];
  createdAt: string;
  updatedAt: string;
};

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export function normalizeDomain(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function isCompanyTag(value: string): value is CompanyTag {
  return (COMPANY_TAGS as readonly string[]).includes(value);
}

export async function getLeadSettings(): Promise<LeadSettings> {
  const [row] = await db
    .select()
    .from(leadSettings)
    .where(eq(leadSettings.id, "me"))
    .limit(1);
  return (
    row ?? {
      id: "me",
      searxngUrl: "",
      productContext: "",
      updatedAt: new Date(0).toISOString(),
    }
  );
}

export async function updateLeadSettings(input: {
  searxngUrl: string;
  productContext: string;
}) {
  const updatedAt = now();
  await db
    .insert(leadSettings)
    .values({ id: "me", ...input, updatedAt })
    .onConflictDoUpdate({
      target: leadSettings.id,
      set: { ...input, updatedAt },
    });
  return { ...input, updatedAt };
}

export async function createRun(kind: RunKind, criteria: RunCriteria) {
  const timestamp = now();
  const row: typeof discoveryRuns.$inferInsert = {
    id: id(),
    kind,
    state: "queued",
    criteria: JSON.stringify(criteria),
    resultCount: 0,
    skippedCount: 0,
    error: null,
    summary: "",
    startedAt: null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.insert(discoveryRuns).values(row);
  await recordRunEvent(row.id, "created", runCreatedMessage(kind, criteria));
  return (await getRun(row.id))!;
}

function runCreatedMessage(kind: RunKind, criteria: RunCriteria) {
  if (kind === "research") return "Research run queued.";
  const discovery = criteria as DiscoveryCriteria;
  return `Discovery run queued for up to ${discovery.limit} lead${discovery.limit === 1 ? "" : "s"}.`;
}

export async function getRun(runId: string): Promise<DiscoveryRun | undefined> {
  const [row] = await db
    .select()
    .from(discoveryRuns)
    .where(eq(discoveryRuns.id, runId))
    .limit(1);
  return row;
}

export async function requireRun(runId: string): Promise<DiscoveryRun> {
  const row = await getRun(runId);
  if (!row) throw new HttpError(404, "Discovery run not found.");
  return row;
}

export function parseRunCriteria(run: DiscoveryRun): RunCriteria {
  try {
    const parsed: unknown = JSON.parse(run.criteria);
    if (typeof parsed === "object" && parsed !== null && "companyId" in parsed) {
      return parsed as ResearchCriteria;
    }
    const criteria = normalizeDiscoveryCriteria(parsed);
    if (!criteria) throw new Error("unrecognised criteria shape");
    return criteria;
  } catch {
    throw new HttpError(409, "This run has no readable criteria.");
  }
}

export async function listRuns(limit = 25) {
  return db
    .select()
    .from(discoveryRuns)
    .orderBy(desc(discoveryRuns.createdAt))
    .limit(limit);
}

export async function markRunRunning(runId: string) {
  const timestamp = now();
  await db
    .update(discoveryRuns)
    .set({ state: "running", startedAt: timestamp, updatedAt: timestamp })
    .where(and(eq(discoveryRuns.id, runId), eq(discoveryRuns.state, "queued")));
}

export async function finishRun(
  runId: string,
  input: {
    state: "completed" | "failed" | "cancelled";
    summary?: string;
    error?: string | null;
    resultCount?: number;
    skippedCount?: number;
  },
) {
  const timestamp = now();
  await db
    .update(discoveryRuns)
    .set({
      state: input.state,
      summary: input.summary?.slice(0, 4000) ?? "",
      error: input.error?.slice(0, 2000) ?? null,
      resultCount: input.resultCount,
      skippedCount: input.skippedCount,
      completedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(discoveryRuns.id, runId));
}

export async function updateRunProgress(
  runId: string,
  input: { resultCount?: number; skippedCount?: number },
) {
  await db
    .update(discoveryRuns)
    .set({ ...input, updatedAt: now() })
    .where(eq(discoveryRuns.id, runId));
}

export async function recordRunEvent(
  runId: string,
  kind: string,
  message: string,
  metadata?: unknown,
) {
  const serialized = metadata === undefined ? null : JSON.stringify(metadata);
  await db.insert(discoveryRunEvents).values({
    id: id(),
    runId,
    kind: kind.slice(0, 60),
    message: message.slice(0, 2000),
    metadata:
      serialized && serialized.length <= 20000
        ? serialized
        : serialized
          ? JSON.stringify({ truncated: true })
          : null,
    createdAt: now(),
  });
}

export async function listRunEvents(runId: string) {
  return db
    .select()
    .from(discoveryRunEvents)
    .where(eq(discoveryRunEvents.runId, runId))
    .orderBy(discoveryRunEvents.createdAt, discoveryRunEvents.id)
    .limit(300);
}

export async function saveFetchedSource(input: {
  runId: string;
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
  rendered?: boolean;
}): Promise<LeadSource> {
  const [existing] = await db
    .select()
    .from(leadSources)
    .where(
      and(eq(leadSources.runId, input.runId), eq(leadSources.url, input.url)),
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(leadSources)
    .values({
      id: id(),
      runId: input.runId,
      url: input.url,
      title: input.title,
      excerpt: input.excerpt,
      retrievedAt: input.retrievedAt,
      rendered: input.rendered ? 1 : 0,
      createdAt: now(),
    })
    .returning();
  if (!row) throw new Error("Could not save the fetched source.");
  return row;
}

export async function getRunSource(runId: string, sourceId: string) {
  const [row] = await db
    .select()
    .from(leadSources)
    .where(and(eq(leadSources.runId, runId), eq(leadSources.id, sourceId)))
    .limit(1);
  return row;
}

export async function listRunSources(runId: string) {
  return db
    .select()
    .from(leadSources)
    .where(eq(leadSources.runId, runId))
    .orderBy(leadSources.createdAt);
}

export async function listCompanyEvidence(companyId: string) {
  return db
    .select()
    .from(leadEvidence)
    .where(eq(leadEvidence.companyId, companyId))
    .orderBy(desc(leadEvidence.retrievedAt))
    .limit(100);
}

export async function findCompanyByDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return undefined;
  const rows = await executeStatement<
    Record<string, unknown> & { id: string; website: string }
  >(
    `SELECT id,name,website,location,description,notes,status,created_at AS createdAt,updated_at AS updatedAt
     FROM tracker_companies`,
  );
  return rows.find(
    (row) => normalizeDomain(String(row.website ?? "")) === normalized,
  );
}

export async function findCompanyByName(name: string) {
  const normalized = name.trim();
  if (!normalized) return undefined;
  const rows = await executeStatement<Record<string, unknown> & { id: string }>(
    `SELECT id,name,website,location,description,notes,status,created_at AS createdAt,updated_at AS updatedAt
     FROM tracker_companies
     WHERE lower(trim(name)) = lower(trim(?))
     LIMIT 1`,
    [normalized],
  );
  return rows[0];
}

export async function findCompanyById(companyId: string) {
  const rows = await executeStatement<Record<string, unknown> & { id: string }>(
    `SELECT id,name,website,location,description,notes,status,created_at AS createdAt,updated_at AS updatedAt
     FROM tracker_companies WHERE id=?`,
    [companyId],
  );
  return rows[0];
}

export async function listCompanyTags(
  companyId: string,
): Promise<CompanyTag[]> {
  const rows = await db
    .select({ tag: companyTags.tag })
    .from(companyTags)
    .where(eq(companyTags.companyId, companyId));
  return rows
    .map((row) => row.tag)
    .filter((tag): tag is CompanyTag => isCompanyTag(tag));
}

export async function setCompanyTags(
  companyId: string,
  tags: CompanyTag[],
): Promise<CompanyTag[]> {
  const unique = [...new Set(tags)];
  await db.delete(companyTags).where(eq(companyTags.companyId, companyId));
  if (unique.length) {
    await db.insert(companyTags).values(
      unique.map((tag) => ({
        companyId,
        tag,
        createdAt: now(),
      })),
    );
  }
  return unique;
}

export async function addCompanyTag(companyId: string, tag: CompanyTag) {
  await db
    .insert(companyTags)
    .values({ companyId, tag, createdAt: now() })
    .onConflictDoNothing();
}

export async function addEvidence(input: {
  companyId: string;
  runId: string | null;
  source: LeadSource;
  claim: string;
}) {
  const [existing] = await db
    .select({ id: leadEvidence.id })
    .from(leadEvidence)
    .where(
      and(
        eq(leadEvidence.companyId, input.companyId),
        eq(leadEvidence.sourceId, input.source.id),
        eq(leadEvidence.claim, input.claim),
      ),
    )
    .limit(1);
  if (existing) return false;
  const row: typeof leadEvidence.$inferInsert = {
    id: id(),
    companyId: input.companyId,
    runId: input.runId,
    sourceId: input.source.id,
    sourceUrl: input.source.url,
    pageTitle: input.source.title,
    claim: input.claim.slice(0, 2000),
    excerpt: input.source.excerpt.slice(0, 6000),
    retrievedAt: input.source.retrievedAt,
    createdAt: now(),
  };
  await db.insert(leadEvidence).values(row);
  return true;
}

export async function createLeadCompany(input: {
  name: string;
  website: string;
  location: string;
  description: string;
  notes: string;
}) {
  const timestamp = now();
  const key = id();
  await executeStatement(
    `INSERT INTO tracker_companies(id,name,website,location,description,status,notes,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      key,
      input.name,
      input.website,
      input.location,
      input.description,
      "Listed",
      input.notes,
      timestamp,
      timestamp,
    ],
  );
  return key;
}

export async function touchCompany(companyId: string) {
  await executeStatement(
    `UPDATE tracker_companies SET updated_at=? WHERE id=?`,
    [now(), companyId],
  );
}

export async function saveResearchBrief(input: {
  companyId: string;
  runId: string;
  content: string;
  findings: ResearchFinding[];
  sources: ResearchSource[];
  model?: string | null;
}) {
  const row: typeof researchBriefs.$inferInsert = {
    id: id(),
    companyId: input.companyId,
    runId: input.runId,
    content: input.content.slice(0, 30000),
    findings: JSON.stringify(input.findings),
    sources: JSON.stringify(input.sources),
    model: input.model ?? null,
    createdAt: now(),
  };
  await db.insert(researchBriefs).values(row);
  return row;
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type ResearchBriefPayload = {
  id: string;
  companyId: string;
  runId: string | null;
  content: string;
  findings: ResearchFinding[];
  sources: ResearchSource[];
  model: string | null;
  createdAt: string;
};

export function briefPayload(row: ResearchBrief): ResearchBriefPayload {
  return {
    id: row.id,
    companyId: row.companyId,
    runId: row.runId,
    content: row.content,
    findings: safeJson<ResearchFinding[]>(row.findings, []),
    sources: safeJson<ResearchSource[]>(row.sources, []),
    model: row.model,
    createdAt: row.createdAt,
  };
}

export async function getLatestResearchBrief(companyId: string) {
  const [row] = await db
    .select()
    .from(researchBriefs)
    .where(eq(researchBriefs.companyId, companyId))
    .orderBy(desc(researchBriefs.createdAt))
    .limit(1);
  return row ? briefPayload(row) : null;
}

export async function getRunResearchBrief(runId: string) {
  const [row] = await db
    .select()
    .from(researchBriefs)
    .where(eq(researchBriefs.runId, runId))
    .orderBy(desc(researchBriefs.createdAt))
    .limit(1);
  return row ? briefPayload(row) : null;
}

export async function listCompanyResearchRuns(companyId: string) {
  const rows = await db
    .select()
    .from(discoveryRuns)
    .where(eq(discoveryRuns.kind, "research"))
    .orderBy(desc(discoveryRuns.createdAt))
    .limit(100);
  return rows.filter((row) => {
    const criteria = safeJson<Partial<ResearchCriteria>>(row.criteria, {});
    return criteria.companyId === companyId;
  });
}

export async function getCompanyOverview(companyId: string) {
  const company = await findCompanyById(companyId);
  if (!company) throw new HttpError(404, "Company not found.");
  const [tags, evidence, brief, researchRuns] = await Promise.all([
    listCompanyTags(companyId),
    listCompanyEvidence(companyId),
    getLatestResearchBrief(companyId),
    listCompanyResearchRuns(companyId),
  ]);
  const applications = await executeStatement<{ count: number }>(
    `SELECT COUNT(*) AS count FROM tracker_applications WHERE company_id=?`,
    [companyId],
  );
  return {
    company: {
      ...company,
      tags,
      tagCount: tags.length,
      applicationCount: applications[0]?.count ?? 0,
    },
    evidence,
    brief,
    researchRun: researchRuns[0] ?? null,
  };
}

export async function getRunLeads(runId: string) {
  const rows = await executeStatement<
    Record<string, unknown> & { id: string; tags: string | null }
  >(
    `SELECT c.id,c.name,c.website,c.location,c.description,c.status,c.updated_at AS updatedAt,
            GROUP_CONCAT(DISTINCT t.tag) AS tags
     FROM lead_evidence e
     JOIN tracker_companies c ON c.id=e.company_id
     LEFT JOIN company_tags t ON t.company_id=c.id
     WHERE e.run_id=?
     GROUP BY c.id
     ORDER BY c.updated_at DESC`,
    [runId],
  );
  if (!rows.length) return [];
  const evidence = await db
    .select({
      companyId: leadEvidence.companyId,
      sourceUrl: leadEvidence.sourceUrl,
      pageTitle: leadEvidence.pageTitle,
      claim: leadEvidence.claim,
    })
    .from(leadEvidence)
    .where(eq(leadEvidence.runId, runId))
    .orderBy(leadEvidence.retrievedAt);
  const byCompany = new Map<
    string,
    { claim: string; sources: Array<{ url: string; title: string }> }
  >();
  for (const item of evidence) {
    const entry = byCompany.get(item.companyId) ?? {
      claim: item.claim,
      sources: [],
    };
    if (!entry.sources.some((source) => source.url === item.sourceUrl)) {
      entry.sources.push({ url: item.sourceUrl, title: item.pageTitle });
    }
    byCompany.set(item.companyId, entry);
  }
  return rows.map((row) => {
    const linked = byCompany.get(row.id);
    return {
      ...row,
      tags: (row.tags ?? "")
        .split(",")
        .filter((tag): tag is CompanyTag => isCompanyTag(tag)),
      matchReason: linked?.claim ?? "",
      sources: linked?.sources ?? [],
    };
  });
}

export async function getRunDetails(runId: string) {
  const run = await requireRun(runId);
  const [events, leads] = await Promise.all([
    listRunEvents(runId),
    getRunLeads(runId),
  ]);
  return { run, events, leads };
}

export type RunEventPayload = DiscoveryRunEvent;
export type EvidencePayload = LeadEvidence;
