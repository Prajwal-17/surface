import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../infrastructure/database/client";
import {
  companyInputSchema,
  companyTrackingStatusSchema,
  inspectUrlsSchema,
  sourceInputSchema,
} from "@surface/contracts";
import { HttpError } from "../../shared/errors/http-error";
import { companies, configuredSources } from "./workspace.tables";
import { minimumFetchHours } from "../work/work.service";
import { inspectSource } from "./source-inspection";
export const workspaceRoutes = new Hono();
workspaceRoutes.get("/companies", async (c) =>
  c.json(await db.select().from(companies)),
);
workspaceRoutes.get("/tracked-companies", async (c) =>
  c.json(
    await db
      .select({
        id: companies.id,
        name: companies.name,
        website: companies.website,
        watchReason: companies.watchReason,
        archived: companies.archived,
        trackingStatus: companies.trackingStatus,
        logoPath: companies.logoPath,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt,
        openRoles: sql<number>`(SELECT CAST(count(*) AS INTEGER) FROM jobs j WHERE j.company_id = companies.id AND j.merged_into IS NULL AND EXISTS (
      SELECT 1 FROM job_sources s WHERE s.job_id = j.id AND s.availability IN ('observed', 'open', 'active')
    ))`,
        applicationCount: sql<number>`(SELECT CAST(count(*) AS INTEGER) FROM applications a WHERE a.company_id = companies.id AND a.archived_at IS NULL)`,
        newestOpening: sql<
          string | null
        >`(SELECT max(coalesce(j.posted_at, j.first_seen_at)) FROM jobs j WHERE j.company_id = companies.id AND j.merged_into IS NULL AND EXISTS (
      SELECT 1 FROM job_sources s WHERE s.job_id = j.id AND s.availability IN ('observed', 'open', 'active')
    ))`,
      })
      .from(companies),
  ),
);
workspaceRoutes.patch(
  "/tracked-companies/:id",
  zValidator(
    "json",
    z.object({
      trackingStatus: companyTrackingStatusSchema.optional(),
      archived: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const [row] = await db
      .update(companies)
      .set({ ...c.req.valid("json"), updatedAt: new Date().toISOString() })
      .where(eq(companies.id, c.req.param("id")))
      .returning();
    if (!row) throw new HttpError(404, "Company not found.");
    return c.json(row);
  },
);
workspaceRoutes.post(
  "/companies",
  zValidator("json", companyInputSchema),
  async (c) => {
    const now = new Date().toISOString();
    const row = {
      ...c.req.valid("json"),
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(companies).values(row);
    return c.json(row, 201);
  },
);
workspaceRoutes.put(
  "/companies/:id",
  zValidator("json", companyInputSchema),
  async (c) => {
    const row = (
      await db
        .update(companies)
        .set({ ...c.req.valid("json"), updatedAt: new Date().toISOString() })
        .where(eq(companies.id, c.req.param("id")))
        .returning()
    )[0];
    if (!row) throw new HttpError(404, "Company not found.");
    return c.json(row);
  },
);
workspaceRoutes.get("/sources", async (c) =>
  c.json(await db.select().from(configuredSources)),
);
workspaceRoutes.post(
  "/sources/inspect",
  zValidator("json", inspectUrlsSchema),
  (c) => c.json(c.req.valid("json").urls.map(inspectSource)),
);
workspaceRoutes.post(
  "/sources",
  zValidator("json", sourceInputSchema),
  async (c) => {
    const input = c.req.valid("json"),
      inspection = inspectSource(input.url),
      now = new Date().toISOString();
    if (
      input.companyId &&
      !(
        await db
          .select()
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1)
      )[0]
    )
      throw new HttpError(400, "Company not found.");
    if (
      (
        await db
          .select()
          .from(configuredSources)
          .where(
            or(
              eq(configuredSources.url, inspection.url),
              eq(configuredSources.endpoint, inspection.endpoint),
            ),
          )
          .limit(1)
      )[0]
    )
      throw new HttpError(409, "This source is already configured.");
    const row = {
      ...input,
      ...inspection,
      scheduleHours:
        input.scheduleHours === 0
          ? 0
          : Math.max(
              input.scheduleHours,
              minimumFetchHours(inspection.provider),
            ),
      nextDueAt: now,
      label:
        input.label || inspection.boardIdentity || new URL(input.url).hostname,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(configuredSources).values(row);
    return c.json(row, 201);
  },
);
workspaceRoutes.put(
  "/sources/:id",
  zValidator("json", sourceInputSchema),
  async (c) => {
    const input = c.req.valid("json");
    if (
      input.companyId &&
      !(
        await db
          .select()
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1)
      )[0]
    )
      throw new HttpError(400, "Company not found.");
    const duplicate = (
      await db
        .select()
        .from(configuredSources)
        .where(
          or(
            eq(configuredSources.url, inspectSource(input.url).url),
            eq(configuredSources.endpoint, inspectSource(input.url).endpoint),
          ),
        )
        .limit(1)
    )[0];
    if (duplicate && duplicate.id !== c.req.param("id"))
      throw new HttpError(409, "This source is already configured.");
    const row = (
      await db
        .update(configuredSources)
        .set({
          ...input,
          ...inspectSource(input.url),
          scheduleHours:
            input.scheduleHours === 0
              ? 0
              : Math.max(
                  input.scheduleHours,
                  minimumFetchHours(inspectSource(input.url).provider),
                ),
          nextDueAt: input.scheduleHours
            ? new Date(Date.now() + input.scheduleHours * 3600000).toISOString()
            : null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(configuredSources.id, c.req.param("id")))
        .returning()
    )[0];
    if (!row) throw new HttpError(404, "Source not found.");
    return c.json(row);
  },
);
