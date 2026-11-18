import { retryCompanyRun } from "../company-discovery/service";
import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { runs } from "./work.tables";
import { getRun, syncRuns } from "./work.service";
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
  throw new HttpError(409, "This legacy job processing run is disabled.");
});
