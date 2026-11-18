import { retryCompanyRun } from "../company-discovery/service";
import { enqueueAnalysis } from "../analysis/analysis.service";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, isNotNull, lte, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { runs, workItems } from "./work.tables";
import { configuredSources } from "../workspace/workspace.tables";
import { enqueueCollection, getRun, syncRuns } from "./work.service";
import { HttpError } from "../../shared/errors/http-error";
export const workRoutes = new Hono();
workRoutes.get("/runs", async (c) => {
  await syncRuns();
  return c.json(
    await Promise.all(
      (
        await db.select().from(runs).orderBy(desc(runs.createdAt)).limit(100)
      ).map(async (r) => await getRun(r.id)),
    ),
  );
});
workRoutes.get("/runs/:id", async (c) =>
  c.json(await getRun(c.req.param("id"))),
);
workRoutes.post("/runs/:id/retry", async (c) => {
  const run = await getRun(c.req.param("id"));
  const failed = run.items.filter((i) =>
    ["failed", "interrupted", "partial"].includes(i.state),
  );
  if (run.kind.startsWith("company-")) {
    if (!failed.length) throw new HttpError(409, "No company work to retry.");
    return c.json(await retryCompanyRun(failed, run.label), 202);
  }
  if (run.kind === "analysis")
    return c.json(
      await enqueueAnalysis(failed.map((i) => i.jobId!).filter(Boolean)),
      202,
    );
  if (!failed.length)
    throw new HttpError(409, "No failed collection items to retry.");
  return c.json(
    await enqueueCollection(
      failed.map((i) => i.sourceId!).filter(Boolean),
      `Retry · ${run.label}`,
    ),
    202,
  );
});
workRoutes.get("/refresh", async (c) => {
  const [[latest], [active], [available]] = await Promise.all([
    db
      .select({ date: configuredSources.lastSuccessAt })
      .from(configuredSources)
      .where(
        and(
          eq(configuredSources.paused, false),
          eq(configuredSources.support, "supported"),
          isNotNull(configuredSources.lastSuccessAt),
        ),
      )
      .orderBy(desc(configuredSources.lastSuccessAt))
      .limit(1),
    db
      .select({ id: workItems.id })
      .from(workItems)
      .where(
        and(
          eq(workItems.kind, "collection"),
          or(
            eq(workItems.state, "running"),
            and(
              eq(workItems.state, "queued"),
              lte(workItems.retryAt, new Date().toISOString()),
            ),
          ),
        ),
      )
      .limit(1),
    db
      .select({ id: configuredSources.id })
      .from(configuredSources)
      .where(
        and(
          eq(configuredSources.paused, false),
          eq(configuredSources.support, "supported"),
        ),
      )
      .limit(1),
  ]);
  return c.json({
    lastSuccessAt: latest?.date ?? null,
    active: Boolean(active),
    available: Boolean(available),
  });
});
workRoutes.post("/refresh", async (c) => {
  const sources = await db
    .select({ id: configuredSources.id })
    .from(configuredSources)
    .where(
      and(
        eq(configuredSources.paused, false),
        eq(configuredSources.support, "supported"),
      ),
    );
  if (!sources.length)
    throw new HttpError(409, "Enable a supported portal in Settings first.");
  return c.json(
    await enqueueCollection(sources.map((source) => source.id)),
    202,
  );
});
workRoutes.post(
  "/collection",
  zValidator(
    "json",
    z.object({ sourceIds: z.array(z.string()).min(1).max(100) }),
  ),
  async (c) =>
    c.json(await enqueueCollection(c.req.valid("json").sourceIds), 202),
);

