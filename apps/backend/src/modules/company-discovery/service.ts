import { and, eq, inArray, lte, sql } from "drizzle-orm";
import {
  type CompanySearchInput,
  type CompanyResultCounts,
  type WorkItem,
  companySearchInputSchema,
} from "@surface/contracts";
import { db } from "../../infrastructure/database/client";
import { companies } from "../workspace/workspace.tables";
import { runs, workItems, runItems } from "../work/work.tables";
import { companyDiscoverySearches } from "./tables";
import { nextDailyRun, canonicalUrl } from "./identity";
import { getCompany, persistCandidate } from "./repository";
import {
  discoverUrls,
  matchesRule,
  parseCompanyPage,
  type CompanyCandidate,
} from "./sources";
import { readCompanyPage } from "./evidence";
import { fetchPublic } from "../collection/public-http";
import { persistSnapshot } from "../collection/snapshots";
import { enrichCompany } from "./enrichment";
import { HttpError } from "../../shared/errors/http-error";
export async function enqueueCompanyWork(
  kind: "company-discovery" | "company-enrichment",
  identity: string,
  payload: Record<string, unknown>,
  label: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('surface:company-enqueue'))`,
    );
    const now = new Date().toISOString();
    let [work] = await tx
      .select()
      .from(workItems)
      .where(
        and(
          eq(workItems.identity, identity),
          inArray(workItems.state, ["queued", "running"]),
        ),
      );
    if (!work)
      [work] = await tx
        .insert(workItems)
        .values({
          id: crypto.randomUUID(),
          kind,
          identity,
          payload,
          state: "queued",
          retryAt: now,
          createdAt: now,
        })
        .returning();
    const id = crypto.randomUUID();
    await tx
      .insert(runs)
      .values({ id, kind, label, state: "queued", createdAt: now });
    await tx.insert(runItems).values({ runId: id, workId: work!.id });
    return { runId: id, workId: work!.id };
  });
}
export async function enqueueCompanySearch(id: string, scheduled = false) {
  // Serialize against editing, pausing and concurrent scheduler ticks. The work owns its immutable rule revision.
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(companyDiscoverySearches)
      .where(eq(companyDiscoverySearches.id, id))
      .for("update");
    if (!row) throw new HttpError(404, "Company search not found.");
    if (row.paused)
      throw new HttpError(409, "Resume this company search before running it.");
    const now = new Date();
    if (scheduled && row.nextRunAt && row.nextRunAt > now.toISOString())
      return null;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('surface:company-enqueue'))`,
    );
    const identity = `company-search:${id}`;
    let [work] = await tx
      .select()
      .from(workItems)
      .where(
        and(
          eq(workItems.identity, identity),
          inArray(workItems.state, ["queued", "running"]),
        ),
      );
    if (work) {
      const [run] = await tx
        .select()
        .from(runItems)
        .where(eq(runItems.workId, work.id))
        .limit(1);
      return { runId: run!.runId, workId: work.id };
    }
    [work] = await tx
      .insert(workItems)
      .values({
        id: crypto.randomUUID(),
        kind: "company-discovery",
        identity,
        payload: { searchId: id, revision: row.revision, rule: row.rule },
        state: "queued",
        retryAt: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .returning();
    const runId = crypto.randomUUID();
    await tx.insert(runs).values({
      id: runId,
      kind: "company-discovery",
      label: `Company discovery · ${row.name} · r${row.revision}`,
      state: "queued",
      createdAt: now.toISOString(),
    });
    await tx.insert(runItems).values({ runId, workId: work!.id });
    await tx
      .update(companyDiscoverySearches)
      .set({
        latestRunId: runId,
        latestCounts: null,
        lastRunAt: now.toISOString(),
        nextRunAt:
          row.rule.schedule === "daily"
            ? nextDailyRun(row.rule.timeOfDay, row.rule.timezone, now)
            : null,
      })
      .where(eq(companyDiscoverySearches.id, id));
    return { runId, workId: work!.id };
  });
}
export async function enqueueEnrichment(
  id: string,
  level: "light" | "full" | "contacts",
  seedUrl?: string,
) {
  const c = await getCompany(id);
  if (!c.website)
    throw new HttpError(409, "Add a confirmed website before enrichment.");
  if (c.archived)
    throw new HttpError(409, "Restore this company before enrichment.");
  return enqueueCompanyWork(
    "company-enrichment",
    `company-enrich:${id}:${level}`,
    { companyId: id, level, seedUrl },
    `${level === "contacts" ? "Find contacts" : "Refresh company"} · ${c.name}`,
  );
}
export function parseIntakeCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(value.trim());
      value = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (c !== "\r") value += c;
  }
  if (quoted) throw new HttpError(400, "CSV has an unclosed quoted field.");
  if (value || row.length) {
    row.push(value.trim());
    rows.push(row);
  }
  const headers =
    rows.shift()?.map((h) => h.toLowerCase().replaceAll(" ", "_")) ?? [];
  const indices = headers
    .map((h, i) =>
      ["website", "url", "company_url", "announcement_url"].includes(h)
        ? i
        : -1,
    )
    .filter((i) => i >= 0);
  if (!indices.length)
    throw new HttpError(
      400,
      "CSV needs a website, url, company_url, or announcement_url column.",
    );
  return rows.flatMap((csvRow) =>
    indices.map((i) => csvRow[i]).filter((v): v is string => Boolean(v)),
  );
}
export async function enqueueIntake(urls: string[], csv = "") {
  const { publicUrlSchema } = await import("@surface/contracts");
  const values = [...urls, ...(csv ? parseIntakeCsv(csv) : [])];
  for (const url of values)
    if (!publicUrlSchema.safeParse(url).success)
      throw new HttpError(
        400,
        "CSV contains an invalid URL. Use public HTTP(S) URLs without credentials.",
      );
  const all = [...new Set(values.map(canonicalUrl))];
  if (!all.length || all.length > 100)
    throw new HttpError(
      400,
      "Import 1–100 public company or announcement URLs.",
    );

  return enqueueCompanyWork(
    "company-discovery",
    `company-intake:${all.toSorted().join("|")}`,
    { urls: all },
    `Company intake · ${all.length} URL${all.length === 1 ? "" : "s"}`,
  );
}
export async function enqueueCompanySchedules(now = new Date()) {
  for (const s of await db
    .select()
    .from(companyDiscoverySearches)
    .where(
      and(
        eq(companyDiscoverySearches.paused, false),
        lte(companyDiscoverySearches.nextRunAt, now.toISOString()),
      ),
    ))
    await enqueueCompanySearch(s.id, true);
  const stale = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.archived, false),
        eq(companies.reviewState, "will_apply"),
        sql`(${companies.detailsCheckedAt} IS NULL OR ${companies.detailsCheckedAt}<${new Date(now.getTime() - 7 * 86400000).toISOString()})`,
        sql`(${companies.updatedAt}<${new Date(now.getTime() - 6 * 3600000).toISOString()})`,
      ),
    )
    .limit(2);
  for (const c of stale) if (c.website) await enqueueEnrichment(c.id, "full");
}
interface Outcome {
  state: "new" | "updated" | "unresolved" | "failed" | "filtered";
  url: string;
  companyId?: string;
  error?: string;
  candidate?: CompanyCandidate;
  resolved?: boolean;
}
interface DiscoveryPayload extends Record<string, unknown> {
  searchId?: string;
  revision?: number;
  rule?: CompanySearchInput;
  urls?: string[];
  sourceErrors?: string[];
  outcomes?: Record<string, Outcome>;
  companyId?: string;
  level?: "light" | "full" | "contacts";
  seedUrl?: string;
}
export function summarizeOutcomes(outcomes: Record<string, Outcome>) {
  const counts: CompanyResultCounts = {
    new: 0,
    updated: 0,
    unresolved: 0,
    failed: 0,
    filtered: 0,
  };
  const seen = new Set<string>();
  for (const outcome of Object.values(outcomes)) {
    if (outcome.companyId && seen.has(outcome.companyId)) continue;
    if (outcome.companyId) seen.add(outcome.companyId);
    counts[outcome.state]++;
  }
  return counts;
}
export async function executeCompanyWork(
  item: WorkItem,
  deps = {
    read: readCompanyPage,
    discover: discoverUrls,
    enrich: enrichCompany,
  },
) {
  const [claimed] = await db
    .update(workItems)
    .set({
      state: "running",
      attempts: sql`${workItems.attempts}+1`,
      startedAt: new Date().toISOString(),
      completedAt: null,
    })
    .where(and(eq(workItems.id, item.id), eq(workItems.state, "queued")))
    .returning();
  if (!claimed) return;
  const payload = (claimed.payload ?? {}) as DiscoveryPayload;
  const save = () =>
    db
      .update(workItems)
      .set({
        payload,
        result: {
          ...summarizeOutcomes(payload.outcomes ?? {}),
          processed: Object.keys(payload.outcomes ?? {}).length,
          total: payload.urls?.length ?? 0,
          revision: payload.revision ?? null,
          sourceFailures: payload.sourceErrors?.length ?? 0,
        },
      })
      .where(eq(workItems.id, item.id));
  try {
    if (item.kind === "company-enrichment") {
      const seed = payload.seedUrl
        ? await deps.read(payload.seedUrl).catch(() => undefined)
        : undefined;
      const result = await deps.enrich(
        payload.companyId!,
        payload.level ?? "full",
        seed,
      );
      await db
        .update(workItems)
        .set({
          state: result.errors.length ? "partial" : "completed",
          result: { contacts: result.contacts, pages: result.pages },
          error: result.errors.join("\n") || null,
          completedAt: new Date().toISOString(),
        })
        .where(eq(workItems.id, item.id));
      return;
    }
    if (payload.searchId) {
      const [search] = await db
        .select()
        .from(companyDiscoverySearches)
        .where(eq(companyDiscoverySearches.id, payload.searchId));
      if (!search || search.paused) {
        await db
          .update(workItems)
          .set({
            state: "interrupted",
            error: "Company search paused or removed.",
            completedAt: new Date().toISOString(),
          })
          .where(eq(workItems.id, item.id));
        return;
      }
    }
    if (!payload.urls) {
      const rule = companySearchInputSchema.parse(payload.rule);
      const found = await deps.discover(rule, deps.read, async (url) => {
        const p = await fetchPublic(url);
        await persistSnapshot(p);
        return p.body;
      });
      payload.urls = [
        ...new Set([
          ...(Array.isArray(payload.previousUrls)
            ? (payload.previousUrls as string[])
            : []),
          ...found.urls,
        ]),
      ];
      payload.sourceErrors = found.errors;
      await save();
    }
    payload.outcomes ??= {};
    for (const url of payload.urls) {
      if (
        payload.outcomes[url] &&
        !["failed"].includes(payload.outcomes[url]!.state)
      )
        continue;
      if (payload.searchId) {
        const [s] = await db
          .select()
          .from(companyDiscoverySearches)
          .where(eq(companyDiscoverySearches.id, payload.searchId));
        if (s?.paused)
          throw new HttpError(409, "Company search paused during collection.");
      }
      try {
        const page = await deps.read(url);
        const c = parseCompanyPage(page, payload.rule?.source ?? "manual");
        if (!c) {
          payload.outcomes[url] = {
            state: "unresolved",
            url,
            error:
              "The evidence did not establish a company and confirmed website. Add the company website to confirm this result.",
          };
          await save();
          continue;
        }
        if (payload.rule && !matchesRule(c, payload.rule)) {
          payload.outcomes[url] = {
            state: "filtered",
            url,
            error:
              payload.rule.source === "funding" &&
              !c.announcementDate &&
              !c.publicationDate
                ? "Unknown evidence date; recency cannot be confirmed."
                : "Outside this saved rule.",
          };
          await save();
          continue;
        }
        try {
          const result = await persistCandidate(
            c,
            payload.searchId
              ? { id: payload.searchId, revision: payload.revision! }
              : undefined,
          );
          payload.outcomes[url] = {
            state:
              result.company.createdAt >= item.createdAt ? "new" : "updated",
            url,
            companyId: result.company.id,
          };
          await enqueueEnrichment(result.company.id, "light", page.url);
        } catch (e) {
          payload.outcomes[url] = {
            state: "unresolved",
            url,
            error: e instanceof Error ? e.message : String(e),
            candidate: c,
          };
        }
      } catch (e) {
        payload.outcomes[url] = {
          state: "failed",
          url,
          error: e instanceof Error ? e.message : String(e),
        };
      }
      await save();
    }
    const outcomes = Object.values(payload.outcomes),
      counts = summarizeOutcomes(payload.outcomes);
    const errors = [
      ...(payload.sourceErrors ?? []),
      ...outcomes
        .filter((o) => o.error && o.state !== "filtered")
        .map((o) => `${o.url}: ${o.error}`),
    ];
    const state = !payload.urls.length
      ? "failed"
      : errors.length
        ? "partial"
        : "completed";
    await db
      .update(workItems)
      .set({
        state,
        result: {
          ...counts,
          revision: payload.revision ?? null,
          processed: outcomes.length,
          total: payload.urls.length,
          sourceFailures: payload.sourceErrors?.length ?? 0,
        },
        error: errors.join("\n").slice(0, 10000) || null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(workItems.id, item.id));
    if (payload.searchId)
      await db
        .update(companyDiscoverySearches)
        .set({ latestCounts: counts })
        .where(
          and(
            eq(companyDiscoverySearches.id, payload.searchId),
            sql`EXISTS(SELECT 1 FROM run_items r WHERE r.work_id=${item.id} AND r.run_id=${companyDiscoverySearches.latestRunId})`,
          ),
        );
  } catch (e) {
    const now = new Date().toISOString(),
      retry = claimed.attempts < 3 && !(e instanceof HttpError);
    await db
      .update(workItems)
      .set({
        state: retry
          ? "queued"
          : e instanceof HttpError
            ? "interrupted"
            : "failed",
        error: e instanceof Error ? e.message : String(e),
        retryAt: new Date(
          Date.now() + 60000 * 2 ** claimed.attempts,
        ).toISOString(),
        completedAt: retry ? null : now,
      })
      .where(eq(workItems.id, item.id));
  }
}
export async function retryCompanyRun(items: WorkItem[], label: string) {
  const runId = crypto.randomUUID(),
    now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('surface:company-enqueue'))`,
    );
    await tx.insert(runs).values({
      id: runId,
      kind: items[0]!.kind,
      label: `Retry · ${label}`,
      state: "queued",
      createdAt: now,
    });
    for (const old of items) {
      const p = { ...old.payload } as DiscoveryPayload;
      if (p.searchId) {
        const [search] = await tx
          .select()
          .from(companyDiscoverySearches)
          .where(eq(companyDiscoverySearches.id, p.searchId));
        if (search?.paused)
          throw new HttpError(
            409,
            "Resume the company search before retrying.",
          );
      }
      if (!p.urls?.length || (p.rule && p.sourceErrors?.length)) {
        p.previousUrls = p.urls ?? [];
        delete p.urls;
        delete p.sourceErrors;
      }
      let [active] = await tx
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.identity, old.identity),
            inArray(workItems.state, ["queued", "running"]),
          ),
        );
      if (!active)
        [active] = await tx
          .insert(workItems)
          .values({
            id: crypto.randomUUID(),
            kind: old.kind,
            identity: old.identity,
            payload: p,
            state: "queued",
            retryAt: now,
            createdAt: old.createdAt,
          })
          .returning();
      await tx
        .insert(runItems)
        .values({ runId, workId: active!.id })
        .onConflictDoNothing();
      if (p.searchId)
        await tx
          .update(companyDiscoverySearches)
          .set({ latestRunId: runId, lastRunAt: now, latestCounts: null })
          .where(eq(companyDiscoverySearches.id, p.searchId));
    }
  });
  return { runId };
}
