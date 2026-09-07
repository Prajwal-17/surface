import { enqueueAnalysis } from "../analysis/analysis.service";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { runs, savedSearches } from "./work.tables";
import { configuredSources } from "../workspace/workspace.tables";
import { enqueueCollection, getRun, syncRuns } from "./work.service";
import { savedSearchInputSchema } from "../../shared/contracts";
import { HttpError } from "../../shared/errors/http-error";
export const workRoutes = new Hono();
workRoutes.get("/runs", (c) => {
  syncRuns();
  return c.json(
    db
      .select()
      .from(runs)
      .orderBy(desc(runs.createdAt))
      .limit(100)
      .all()
      .map((r) => getRun(r.id)),
  );
});
workRoutes.get("/runs/:id", (c) => c.json(getRun(c.req.param("id"))));
workRoutes.post("/runs/:id/retry", (c) => {
  const run = getRun(c.req.param("id"));
  const failed = run.items.filter((i) =>
    ["failed", "interrupted", "partial"].includes(i.state),
  );
  if (run.kind === "analysis")
    return c.json(
      enqueueAnalysis(true, failed.map((i) => i.jobId!).filter(Boolean)),
      202,
    );
  if (!failed.length)
    throw new HttpError(409, "No failed collection items to retry.");
  return c.json(
    enqueueCollection(
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
  (c) => c.json(enqueueCollection(c.req.valid("json").sourceIds), 202),
);
workRoutes.get("/saved-searches", (c) =>
  c.json(db.select().from(savedSearches).all()),
);
for (const method of ["post", "put"] as const)
  workRoutes[method](
    method === "post" ? "/saved-searches" : "/saved-searches/:id",
    zValidator("json", savedSearchInputSchema),
    (c) => {
      const input = c.req.valid("json"),
        now = new Date().toISOString();
      for (const id of input.sourceIds)
        if (
          !db
            .select()
            .from(configuredSources)
            .where(eq(configuredSources.id, id))
            .get()
        )
          throw new HttpError(400, "Unknown configured source.");
      const id = c.req.param("id") ?? crypto.randomUUID();
      if (
        method === "put" &&
        !db.select().from(savedSearches).where(eq(savedSearches.id, id)).get()
      )
        throw new HttpError(404, "Saved search not found.");
      const existing = db
        .select()
        .from(savedSearches)
        .where(eq(savedSearches.id, id))
        .get();
      const row = {
        ...input,
        id,
        nextDueAt: input.scheduleHours
          ? new Date(Date.now() + input.scheduleHours * 3600000).toISOString()
          : null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      db.insert(savedSearches)
        .values(row)
        .onConflictDoUpdate({ target: savedSearches.id, set: row })
        .run();
      return c.json(row, method === "post" ? 201 : 200);
    },
  );
workRoutes.post("/saved-searches/:id/refresh", (c) => {
  const search = db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.id, c.req.param("id")))
    .get();
  if (!search) throw new HttpError(404, "Saved search not found.");
  return c.json(enqueueCollection(search.sourceIds, search.name), 202);
});
