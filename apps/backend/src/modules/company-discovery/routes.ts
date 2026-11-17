import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  companySearchInputSchema,
  companyIntakeSchema,
  companyUpdateSchema,
  companyActionInputSchema,
  companyContactInputSchema,
  publicUrlSchema,
} from "@surface/contracts";
import { db, transaction } from "../../infrastructure/database/client";
import { withRowLock } from "../../infrastructure/database/locks";
import { companies } from "../workspace/workspace.tables";
import { workItems } from "../work/work.tables";
import { companyContacts, companyDiscoverySearches } from "./tables";
import {
  getCompany,
  companyDetail,
  listOpportunities,
  recordAction,
  searchRecord,
  persistCandidate,
} from "./repository";
import {
  enqueueCompanySearch,
  enqueueEnrichment,
  enqueueIntake,
} from "./service";
import { nextDailyRun, websiteIdentity } from "./identity";
import { saveContact, orderContacts } from "./contacts";
import { logoDirectory } from "./enrichment";
import { readCompanyPage } from "./evidence";
import { parseCompanyPage, type CompanyCandidate } from "./sources";
import { HttpError } from "../../shared/errors/http-error";
export const companyDiscoveryRoutes = new Hono();
companyDiscoveryRoutes.get("/searches", async (c) =>
  c.json(
    (
      await db
        .select()
        .from(companyDiscoverySearches)
        .where(eq(companyDiscoverySearches.archived, false))
        .orderBy(desc(companyDiscoverySearches.createdAt))
    ).map(searchRecord),
  ),
);
for (const method of ["post", "put"] as const)
  companyDiscoveryRoutes[method](
    method === "post" ? "/searches" : "/searches/:id",
    zValidator("json", companySearchInputSchema),
    async (c) => {
      const input = c.req.valid("json"),
        now = new Date().toISOString(),
        id = c.req.param("id") ?? crypto.randomUUID();
      if (
        input.source === "funding" &&
        input.fundingSources.some((source) => source !== "techcrunch")
      )
        throw new HttpError(
          400,
          "Only TechCrunch has passed source validation. Add other publishers through URL intake.",
        );
      const row = await transaction(async (tx) => {
        const [existing] = await withRowLock(
          tx
            .select()
            .from(companyDiscoverySearches)
            .where(eq(companyDiscoverySearches.id, id)),
        );
        if (method === "put" && (!existing || existing.archived))
          throw new HttpError(404, "Company search not found.");
        const values = {
          name: input.name,
          source: input.source,
          rule: input,
          paused: input.paused,
          revision: (existing?.revision ?? 0) + 1,
          nextRunAt:
            !input.paused && input.schedule === "daily"
              ? nextDailyRun(input.timeOfDay, input.timezone)
              : null,
          updatedAt: now,
        };
        if (existing)
          return (
            await tx
              .update(companyDiscoverySearches)
              .set(values)
              .where(eq(companyDiscoverySearches.id, id))
              .returning()
          )[0]!;
        return (
          await tx
            .insert(companyDiscoverySearches)
            .values({ ...values, id, createdAt: now })
            .returning()
        )[0]!;
      });
      return c.json(searchRecord(row), method === "post" ? 201 : 200);
    },
  );
companyDiscoveryRoutes.delete("/searches/:id", async (c) => {
  const [row] = await db
    .update(companyDiscoverySearches)
    .set({
      archived: true,
      paused: true,
      nextRunAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(companyDiscoverySearches.id, c.req.param("id")))
    .returning();
  if (!row) throw new HttpError(404, "Company search not found.");
  return c.json({ archived: true });
});
companyDiscoveryRoutes.post("/searches/:id/run", async (c) =>
  c.json(await enqueueCompanySearch(c.req.param("id")), 202),
);
companyDiscoveryRoutes.post(
  "/intake",
  zValidator("json", companyIntakeSchema),
  async (c) => {
    const v = c.req.valid("json");
    return c.json(await enqueueIntake(v.urls, v.csv), 202);
  },
);
companyDiscoveryRoutes.get(
  "/opportunities",
  zValidator(
    "query",
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
      q: z.string().max(200).optional(),
      queue: z
        .enum(["all", "new", "will_apply", "later", "done", "skipped"])
        .optional(),
      searchId: z.string().optional(),
      signal: z.enum(["funding", "yc", "manual"]).optional(),
      watchlist: z.enum(["true", "false"]).optional(),
      archived: z.enum(["true", "false"]).optional(),
      hasResearch: z.enum(["true", "false"]).optional(),
    }),
  ),
  async (c) => {
    const v = c.req.valid("query");
    return c.json(
      await listOpportunities({
        ...v,
        watchlist: v.watchlist === "true",
        archived: v.archived === "true",
        hasResearch:
          v.hasResearch === undefined ? undefined : v.hasResearch === "true",
      }),
    );
  },
);
companyDiscoveryRoutes.get("/companies/:id", async (c) => {
  const detail = await companyDetail(c.req.param("id"));
  return c.json({ ...detail, contacts: orderContacts(detail.contacts) });
});
companyDiscoveryRoutes.patch(
  "/companies/:id",
  zValidator("json", companyUpdateSchema),
  async (c) => {
    const v = c.req.valid("json");
    if (v.deferredUntil && v.deferredUntil <= new Date().toISOString())
      throw new HttpError(400, "Choose a future reminder date.");
    if (v.website) {
      const domain = websiteIdentity(v.website);
      if (!domain)
        throw new HttpError(400, "Use the official company website.");
      const existing = await db.select().from(companies);
      if (
        existing.some(
          (row) =>
            row.id !== c.req.param("id") &&
            websiteIdentity(row.website) === domain,
        )
      )
        throw new HttpError(
          409,
          "Another company uses this website. Confirm the discovery against that company instead.",
        );
    }
    const [row] = await db
      .update(companies)
      .set({
        ...v,
        ...(v.website !== undefined
          ? {
              normalizedWebsite: websiteIdentity(v.website),
              detailsCheckedAt: null,
            }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(companies.id, c.req.param("id")))
      .returning();
    if (!row) throw new HttpError(404, "Company not found.");
    return c.json(row);
  },
);
companyDiscoveryRoutes.post(
  "/companies/:id/actions",
  zValidator("json", companyActionInputSchema),
  async (c) => {
    const input = c.req.valid("json"),
      action = await recordAction(c.req.param("id"), input);
    if (input.kind === "will_apply") {
      const company = await getCompany(c.req.param("id"));
      if (company.website) await enqueueEnrichment(company.id, "full");
    }
    return c.json(action, 201);
  },
);
companyDiscoveryRoutes.post("/companies/:id/refresh", async (c) =>
  c.json(await enqueueEnrichment(c.req.param("id"), "full"), 202),
);
companyDiscoveryRoutes.post("/companies/:id/contacts/find", async (c) =>
  c.json(await enqueueEnrichment(c.req.param("id"), "contacts"), 202),
);
companyDiscoveryRoutes.post("/companies/:id/open", async (c) => {
  const company = await getCompany(c.req.param("id"));
  if (
    !company.website ||
    (company.detailsCheckedAt &&
      Date.now() - Date.parse(company.detailsCheckedAt) < 24 * 3600000)
  )
    return c.json({ runId: null });
  return c.json(await enqueueEnrichment(company.id, "full"), 202);
});
for (const method of ["post", "put"] as const)
  companyDiscoveryRoutes[method](
    method === "post"
      ? "/companies/:id/contacts"
      : "/companies/:id/contacts/:contactId",
    zValidator("json", companyContactInputSchema),
    async (c) => {
      await getCompany(c.req.param("id"));
      const contactId = c.req.param("contactId");
      if (
        contactId &&
        !(
          await db
            .select()
            .from(companyContacts)
            .where(
              and(
                eq(companyContacts.companyId, c.req.param("id")),
                eq(companyContacts.id, contactId),
              ),
            )
        )[0]
      )
        throw new HttpError(404, "Contact not found.");
      const input = c.req.valid("json");
      if (input.methods.some((m) => m.status === "mailbox_verified"))
        throw new HttpError(
          400,
          "Manual corrections cannot assert mailbox verification.",
        );
      return c.json(
        await saveContact(c.req.param("id"), input, true, contactId),
        method === "post" ? 201 : 200,
      );
    },
  );
companyDiscoveryRoutes.get("/sources", async (c) => {
  const checks = await db
    .select({
      kind: workItems.kind,
      state: workItems.state,
      error: workItems.error,
      completedAt: workItems.completedAt,
      createdAt: workItems.createdAt,
      payload: workItems.payload,
    })
    .from(workItems)
    .where(sql`${workItems.kind} IN ('company-discovery','company-enrichment')`)
    .orderBy(desc(workItems.createdAt))
    .limit(20);
  return c.json({
    sources: [
      {
        id: "funding",
        name: "Funding news",
        description:
          "Selected publishers through SearXNG; TechCrunch RSS also supplies current leads. Dates are checked on source pages.",
        status: "available",
      },
      {
        id: "yc",
        name: "Y Combinator",
        description:
          "Public directory search and company profiles, filtered against each profile’s recorded batch. SearXNG is a fallback; query-page crawling respects robots.txt.",
        status: "available",
      },
      {
        id: "manual",
        name: "Manual intake",
        description:
          "Company websites, announcement URLs, YC profiles, and CSV imports.",
        status: "available",
      },
      {
        id: "crunchbase",
        name: "Crunchbase",
        description: "Optional integration requiring provisioned API access.",
        status: "not_configured",
      },
    ],
    checks: checks.map(({ payload, ...r }) => ({
      ...r,
      source:
        payload?.rule && typeof payload.rule === "object"
          ? (payload.rule as Record<string, unknown>).source
          : "manual",
    })),
  });
});
companyDiscoveryRoutes.get("/unresolved", async (c) => {
  const rows = await db
    .select()
    .from(workItems)
    .where(eq(workItems.kind, "company-discovery"))
    .orderBy(desc(workItems.createdAt))
    .limit(100);
  return c.json(
    rows.flatMap((w) =>
      Object.entries(
        (w.payload?.outcomes ?? {}) as Record<
          string,
          {
            state: string;
            url: string;
            error?: string;
            candidate?: CompanyCandidate;
          }
        >,
      )
        .filter(([, o]) => o.state === "unresolved")
        .map(([url, o]) => ({
          workId: w.id,
          url,
          error: o.error,
          name: o.candidate?.name,
          website: o.candidate?.website,
        })),
    ),
  );
});
companyDiscoveryRoutes.post(
  "/resolve",
  zValidator(
    "json",
    z.object({
      workId: z.string(),
      url: publicUrlSchema,
      website: publicUrlSchema,
      companyId: z.string().optional(),
    }),
  ),
  async (c) => {
    const v = c.req.valid("json"),
      [work] = await db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.id, v.workId),
            eq(workItems.kind, "company-discovery"),
          ),
        );
    const payload = work?.payload,
      outcomes = payload?.outcomes as
        | Record<string, { state: string; candidate?: CompanyCandidate }>
        | undefined,
      old = outcomes?.[v.url];
    if (!work || !old || old.state !== "unresolved")
      throw new HttpError(404, "Unresolved discovery not found.");
    if (["queued", "running"].includes(work.state))
      throw new HttpError(
        409,
        "Wait until this discovery run finishes before confirming a result.",
      );
    const official = await readCompanyPage(v.website),
      cnd = parseCompanyPage(official, "manual");
    if (!cnd)
      throw new HttpError(
        400,
        "That website did not establish a company identity.",
      );
    const candidate = old.candidate
      ? { ...old.candidate, website: cnd.website }
      : cnd;
    if (!candidate.evidence.some((e) => e.url === v.url))
      candidate.evidence.push({
        url: v.url,
        title: "Manually confirmed discovery",
        excerpt: `Website confirmed as ${v.website}`,
        retrievedAt: new Date().toISOString(),
      });
    const result = await persistCandidate(
      candidate,
      payload?.searchId
        ? { id: String(payload.searchId), revision: Number(payload.revision) }
        : undefined,
      v.companyId,
    );
    const outcome = {
      url: v.url,
      state: result.isNew ? "new" : "updated",
      companyId: result.company.id,
      resolved: true,
    };
    await db
      .update(workItems)
      .set({
        payload: {
          ...payload,
          outcomes: { ...outcomes, [v.url]: outcome },
        },
      })
      .where(eq(workItems.id, work.id));
    await enqueueEnrichment(result.company.id, "light", official.url);
    return c.json({ companyId: result.company.id });
  },
);
companyDiscoveryRoutes.get("/logos/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^[a-f0-9]{64}\.(png|jpg|webp|gif|ico|svg)$/.test(file))
    throw new HttpError(404, "Logo not found.");
  const bytes = await readFile(join(logoDirectory, file)).catch(() => null);
  if (!bytes) throw new HttpError(404, "Logo not found.");
  c.header(
    "Content-Type",
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        ico: "image/x-icon",
        svg: "image/svg+xml",
      } as Record<string, string>
    )[file.split(".").at(-1)!]!,
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Security-Policy", "default-src 'none'; sandbox");
  c.header("Cache-Control", "private, max-age=31536000, immutable");
  return c.body(bytes);
});
