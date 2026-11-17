import { roleMatcher } from "../jobs/relevance";
import { findProfile } from "../profile/profile.repository";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  queryRows,
  transaction,
} from "../../infrastructure/database/client";
import {
  lockCoordination,
  withRowLock,
} from "../../infrastructure/database/locks";
import {
  jsonText,
  containsPattern,
  countAsInteger,
  countWhereAsInteger,
} from "../../infrastructure/database/sql-helpers";
import { companies } from "../workspace/workspace.tables";
import { jobs } from "../jobs/jobs.tables";
import { workItems } from "../work/work.tables";
import { researchReports, researchRuns } from "../research/research.tables";
import {
  companyActions,
  companyContacts,
  companyDiscoverySearches,
  companySearchMatches,
  companySignals,
} from "./tables";
import {
  companyActionInputSchema,
  type CompanyDiscoverySearch,
} from "@surface/contracts";
import type { z } from "zod";
import type { CompanyCandidate } from "./sources";
import { canonicalUrl, websiteIdentity } from "./identity";
import { HttpError } from "../../shared/errors/http-error";
export const searchRecord = (
  row: typeof companyDiscoverySearches.$inferSelect,
): CompanyDiscoverySearch => ({ ...row.rule, ...row, paused: row.paused });
export async function getCompany(id: string) {
  const [c] = await db.select().from(companies).where(eq(companies.id, id));
  if (!c) throw new HttpError(404, "Company not found.");
  return c;
}
export async function persistCandidate(
  candidate: CompanyCandidate,
  search?: { id: string; revision: number },
  confirmedId?: string,
) {
  return transaction(async (tx) => {
    await lockCoordination(tx, "surface:company-identity");
    const domain = websiteIdentity(candidate.website);
    if (!domain) throw new Error("Company website requires confirmation.");
    const all = await tx.select().from(companies);
    const providerMatches = candidate.providerId
      ? await tx
          .select()
          .from(companySignals)
          .where(
            and(
              eq(companySignals.provider, candidate.provider),
              eq(companySignals.providerId, candidate.providerId),
            ),
          )
      : [];
    const providerIds = new Set(providerMatches.map((s) => s.companyId));
    const matches = all.filter(
      (c) =>
        c.normalizedWebsite === domain ||
        websiteIdentity(c.website) === domain ||
        providerIds.has(c.id),
    );
    if (
      !confirmedId &&
      (matches.length > 1 ||
        matches.some(
          (c) => providerIds.has(c.id) && websiteIdentity(c.website) !== domain,
        ))
    )
      throw new Error(
        "Ambiguous company identity. Confirm the company before saving this discovery.",
      );
    let company = confirmedId
      ? all.find((c) => c.id === confirmedId)
      : matches[0];
    if (confirmedId && !company) throw new HttpError(404, "Company not found.");
    const now = new Date().toISOString(),
      isNew = !company;
    if (!company) {
      [company] = await tx
        .insert(companies)
        .values({
          id: crypto.randomUUID(),
          name: candidate.name,
          website: candidate.website,
          normalizedWebsite: domain,
          description: candidate.description,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    } else {
      [company] = await tx
        .update(companies)
        .set({
          normalizedWebsite: sql`COALESCE(${companies.normalizedWebsite},${websiteIdentity(company.website)})`,
          ...(!company.description && candidate.description
            ? {
                description: sql`CASE WHEN ${companies.description}='' THEN ${candidate.description} ELSE ${companies.description} END`,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(companies.id, company.id))
        .returning();
    }
    const existing = await tx
      .select()
      .from(companySignals)
      .where(eq(companySignals.companyId, company!.id));
    let event = existing.find((s) =>
      candidate.kind === "yc"
        ? s.kind === "yc" && s.providerId === candidate.providerId
        : s.kind === candidate.kind &&
          s.evidence.some(
            (e) => canonicalUrl(e.url) === canonicalUrl(candidate.page.url),
          ),
    );
    if (!event && candidate.kind === "funding" && candidate.amount) {
      const possible = existing.filter((s) => {
        if (
          s.kind !== "funding" ||
          s.amount !== candidate.amount ||
          s.currency !== candidate.currency ||
          (s.stage && candidate.stage && s.stage !== candidate.stage)
        )
          return false;
        if (s.announcementDate && candidate.announcementDate)
          return s.announcementDate === candidate.announcementDate;
        const a = s.announcementDate ?? s.publicationDate,
          b = candidate.announcementDate ?? candidate.publicationDate;
        return Boolean(
          a && b && Math.abs(Date.parse(a) - Date.parse(b)) <= 7 * 86400000,
        );
      });
      if (possible.length === 1) event = possible[0];
      if (possible.length > 1)
        throw new Error(
          "Several funding events could match. Confirm the event before merging references.",
        );
    }
    const {
      page: _,
      name: __,
      website: ___,
      description: ____,
      ...signal
    } = candidate;
    if (event) {
      const evidence = [...event.evidence];
      for (const e of candidate.evidence) {
        const i = evidence.findIndex((x) => x.url === e.url);
        if (i < 0) evidence.push(e);
        else evidence[i] = e;
      }
      [event] = await tx
        .update(companySignals)
        .set({
          evidence: evidence.slice(-40),
          lastSeenAt: now,
          announcementDate:
            event.announcementDate ?? candidate.announcementDate,
          publicationDate: event.publicationDate ?? candidate.publicationDate,
          stage: event.stage ?? candidate.stage,
          amount: event.amount ?? candidate.amount,
          currency: event.currency ?? candidate.currency,
        })
        .where(eq(companySignals.id, event.id))
        .returning();
    } else {
      const identity =
        candidate.kind === "yc"
          ? `yc:${candidate.providerId}`
          : `${candidate.kind}:${canonicalUrl(candidate.page.url)}`;
      [event] = await tx
        .insert(companySignals)
        .values({
          ...signal,
          id: crypto.randomUUID(),
          companyId: company!.id,
          identity,
          firstDiscoveredAt: now,
          lastSeenAt: now,
        })
        .returning();
    }
    if (search)
      await tx
        .insert(companySearchMatches)
        .values({
          id: crypto.randomUUID(),
          searchId: search.id,
          companyId: company!.id,
          signalId: event!.id,
          revision: search.revision,
          firstDiscoveredAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [
            companySearchMatches.searchId,
            companySearchMatches.signalId,
          ],
          set: { lastSeenAt: now, revision: search.revision },
        });
    return { company: company!, signal: event!, isNew };
  });
}
export async function opportunityRows(ids: string[]) {
  if (!ids.length) return [];
  const [rows, signals, contacts, roles, reports, runs] = await Promise.all([
    db.select().from(companies).where(inArray(companies.id, ids)),
    db
      .select()
      .from(companySignals)
      .where(inArray(companySignals.companyId, ids)),
    db
      .select({ companyId: companyContacts.companyId })
      .from(companyContacts)
      .where(inArray(companyContacts.companyId, ids)),
    db
      .select({ companyId: jobs.companyId, id: jobs.id })
      .from(jobs)
      .where(
        and(
          inArray(jobs.companyId, ids),
          sql`${jobs.mergedInto} IS NULL`,
          sql`EXISTS (SELECT 1 FROM job_sources s WHERE s.job_id=${jobs.id} AND s.availability IN ('observed','open','active'))`,
        ),
      ),
    db
      .select({
        companyId: researchReports.companyId,
        reportCount: countAsInteger(),
        latestReportAt: sql<string>`max(${researchReports.createdAt})`,
      })
      .from(researchReports)
      .where(inArray(researchReports.companyId, ids))
      .groupBy(researchReports.companyId),
    db
      .select({ companyId: researchRuns.companyId, state: researchRuns.state })
      .from(researchRuns)
      .where(
        and(
          inArray(researchRuns.companyId, ids),
          eq(researchRuns.kind, "report"),
        ),
      )
      .orderBy(desc(researchRuns.createdAt)),
  ]);
  return rows.map((c) => ({
    ...c,
    signals: signals
      .filter((s) => s.companyId === c.id)
      .toSorted((a, b) =>
        b.firstDiscoveredAt.localeCompare(a.firstDiscoveredAt),
      ),
    contactCount: contacts.filter((x) => x.companyId === c.id).length,
    jobCount: roles.filter((x) => x.companyId === c.id).length,
    research: {
      reportCount: reports.find((r) => r.companyId === c.id)?.reportCount ?? 0,
      latestReportAt:
        reports.find((r) => r.companyId === c.id)?.latestReportAt ?? null,
      state:
        runs.find((r) => r.companyId === c.id)?.state === "running"
          ? ("running" as const)
          : reports.some((r) => r.companyId === c.id)
            ? ("saved" as const)
            : runs.some(
                  (r) =>
                    r.companyId === c.id &&
                    ["failed", "partial", "interrupted", "cancelled"].includes(
                      r.state,
                    ),
                )
              ? ("failed" as const)
              : ("none" as const),
    },
  }));
}
export async function listOpportunities(input: {
  page: number;
  pageSize: number;
  q?: string;
  queue?: string;
  searchId?: string;
  signal?: string;
  watchlist?: boolean;
  archived?: boolean;
  hasResearch?: boolean;
}) {
  const now = new Date().toISOString();
  const filters = [eq(companies.archived, input.archived ?? false)];
  if (input.q)
    filters.push(
      sql`(${containsPattern(companies.name, input.q)} OR ${containsPattern(companies.description, input.q)} OR ${containsPattern(companies.website, input.q)})`,
    );
  if (input.searchId)
    filters.push(
      sql`EXISTS (SELECT 1 FROM company_search_matches m WHERE m.company_id=${companies.id} AND m.search_id=${input.searchId})`,
    );
  if (input.signal)
    filters.push(
      sql`EXISTS (SELECT 1 FROM company_signals s WHERE s.company_id=${companies.id} AND s.kind=${input.signal})`,
    );
  if (input.hasResearch !== undefined)
    filters.push(
      input.hasResearch
        ? sql`EXISTS (SELECT 1 FROM research_reports r WHERE r.company_id=${companies.id})`
        : sql`NOT EXISTS (SELECT 1 FROM research_reports r WHERE r.company_id=${companies.id})`,
    );
  const queue = sql`CASE WHEN ${companies.deferredUntil}>${now} THEN 'later' ELSE ${companies.reviewState} END`;
  if (input.watchlist)
    filters.push(
      sql`(${companies.reviewState}='will_apply' OR ${companies.deferredUntil}>${now})`,
    );
  const [counts] = await db
    .select({
      all: countAsInteger(),
      new: countWhereAsInteger(sql`${queue}='new'`),
      will_apply: countWhereAsInteger(sql`${queue}='will_apply'`),
      later: countWhereAsInteger(sql`${queue}='later'`),
      done: countWhereAsInteger(sql`${queue}='done'`),
      skipped: countWhereAsInteger(sql`${queue}='skipped'`),
    })
    .from(companies)
    .where(and(...filters));
  if (
    input.queue &&
    input.queue !== "all" &&
    !input.watchlist &&
    !input.archived
  )
    filters.push(sql`${queue}=${input.queue}`);
  const [total] = await db
    .select({ value: countAsInteger() })
    .from(companies)
    .where(and(...filters));
  const ids = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(...filters))
    .orderBy(desc(companies.createdAt), companies.id)
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const rows = await opportunityRows(ids.map((r) => r.id)),
    byId = new Map(rows.map((r) => [r.id, r]));
  return {
    items: ids.map((r) => byId.get(r.id)!),
    total: total?.value ?? 0,
    counts: counts ?? {
      all: 0,
      new: 0,
      will_apply: 0,
      later: 0,
      done: 0,
      skipped: 0,
    },
    page: input.page,
    pageSize: input.pageSize,
  };
}
export async function companyDetail(id: string) {
  await getCompany(id);
  const [company] = await opportunityRows([id]);
  const [contacts, actions, roles, matches, pending] = await Promise.all([
    db.select().from(companyContacts).where(eq(companyContacts.companyId, id)),
    db
      .select()
      .from(companyActions)
      .where(eq(companyActions.companyId, id))
      .orderBy(desc(companyActions.createdAt)),
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        location: jobs.location,
        applyUrl: jobs.applyUrl,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, id),
          sql`${jobs.mergedInto} IS NULL`,
          sql`EXISTS(SELECT 1 FROM job_sources s WHERE s.job_id=${jobs.id} AND s.availability IN ('observed','open','active'))`,
        ),
      )
      .limit(500),
    db
      .selectDistinct({
        id: companyDiscoverySearches.id,
        name: companyDiscoverySearches.name,
      })
      .from(companySearchMatches)
      .innerJoin(
        companyDiscoverySearches,
        eq(companySearchMatches.searchId, companyDiscoverySearches.id),
      )
      .where(eq(companySearchMatches.companyId, id)),
    queryRows<{ found: number }>(
      sql`SELECT 1 AS found FROM work_items WHERE kind='company-enrichment' AND state IN ('queued','running') AND ${jsonText(workItems.payload, "companyId")}=${id} LIMIT 1`,
    ),
  ]);
  const profile = await findProfile(),
    matchesRole = roleMatcher(profile);
  return {
    ...company!,
    contacts,
    actions,
    jobs: roles
      .map((j) => ({
        ...j,
        availability: "observed",
        relevant: Boolean(profile) && matchesRole(j),
      }))
      .toSorted((a, b) => Number(b.relevant) - Number(a.relevant))
      .slice(0, 30),
    searches: matches,
    enrichmentPending: pending.length > 0,
  };
}
export async function recordAction(
  companyId: string,
  input: z.infer<typeof companyActionInputSchema>,
) {
  return transaction(async (tx) => {
    const [company] = await withRowLock(
      tx.select().from(companies).where(eq(companies.id, companyId)),
    );
    if (!company) throw new HttpError(404, "Company not found.");
    if (
      input.contactId &&
      !(
        await tx
          .select()
          .from(companyContacts)
          .where(
            and(
              eq(companyContacts.id, input.contactId),
              eq(companyContacts.companyId, companyId),
            ),
          )
      )[0]
    )
      throw new HttpError(400, "Contact belongs to another company.");
    if (
      input.jobId &&
      !(
        await tx
          .select()
          .from(jobs)
          .where(and(eq(jobs.id, input.jobId), eq(jobs.companyId, companyId)))
      )[0]
    )
      throw new HttpError(400, "Job belongs to another company.");
    const [duplicate] = await tx
      .select()
      .from(companyActions)
      .where(eq(companyActions.requestId, input.requestId));
    if (duplicate) {
      if (duplicate.companyId !== companyId)
        throw new HttpError(409, "Action request already used.");
      return duplicate;
    }
    const now = new Date().toISOString();
    if (input.kind === "deferred" && input.deferredUntil! <= now)
      throw new HttpError(400, "Choose a future reminder date.");
    const state =
      input.kind === "will_apply"
        ? "will_apply"
        : input.kind === "skipped"
          ? "skipped"
          : input.kind === "reopened"
            ? "new"
            : ["applied", "contacted"].includes(input.kind)
              ? "done"
              : company.reviewState;
    await tx
      .update(companies)
      .set({
        reviewState: state,
        deferredUntil: input.kind === "deferred" ? input.deferredUntil : null,
        updatedAt: now,
      })
      .where(eq(companies.id, companyId));
    const [action] = await tx
      .insert(companyActions)
      .values({ ...input, id: crypto.randomUUID(), companyId, createdAt: now })
      .returning();
    return action;
  });
}
