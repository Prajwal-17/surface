import { enqueueAnalysis } from "../analysis/analysis.service";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { runs, savedSearches } from "./work.tables";
import { configuredSources } from "../workspace/workspace.tables";
import { enqueueCollection, getRun, syncRuns } from "./work.service";
import { savedSearchInputSchema } from "@surface/contracts";
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
workRoutes.post(
  "/collection",
  zValidator(
    "json",
    z.object({ sourceIds: z.array(z.string()).min(1).max(100) }),
  ),
  async (c) =>
    c.json(await enqueueCollection(c.req.valid("json").sourceIds), 202),
);
workRoutes.get("/saved-searches", async (c) =>
  c.json(await db.select().from(savedSearches)),
);
for (const method of ["post", "put"] as const)
  workRoutes[method](
    method === "post" ? "/saved-searches" : "/saved-searches/:id",
    zValidator("json", savedSearchInputSchema),
    async (c) => {
      const input = c.req.valid("json"),
        now = new Date().toISOString();
      for (const id of input.sourceIds)
        if (
          !(
            await db
              .select()
              .from(configuredSources)
              .where(eq(configuredSources.id, id))
              .limit(1)
          )[0]
        )
          throw new HttpError(400, "Unknown configured source.");
      const id = c.req.param("id") ?? crypto.randomUUID();
      if (
        method === "put" &&
        !(
          await db
            .select()
            .from(savedSearches)
            .where(eq(savedSearches.id, id))
            .limit(1)
        )[0]
      )
        throw new HttpError(404, "Saved search not found.");
      const existing = (
        await db
          .select()
          .from(savedSearches)
          .where(eq(savedSearches.id, id))
          .limit(1)
      )[0];
      const row = {
        ...input,
        id,
        nextDueAt: input.scheduleHours
          ? new Date(Date.now() + input.scheduleHours * 3600000).toISOString()
          : null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db
        .insert(savedSearches)
        .values(row)
        .onConflictDoUpdate({ target: savedSearches.id, set: row });
      return c.json(row, method === "post" ? 201 : 200);
    },
  );
workRoutes.post("/saved-searches/:id/refresh", async (c) => {
  const search = (
    await db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.id, c.req.param("id")))
      .limit(1)
  )[0];
  if (!search) throw new HttpError(404, "Saved search not found.");
  return c.json(await enqueueCollection(search.sourceIds, search.name), 202);
});
