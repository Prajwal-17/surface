import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { jobs } from "./jobs.tables";
import { enqueueAnalysis } from "../analysis/analysis.service";
import {
  jobsListQuerySchema,
  updateJobStatusSchema,
} from "../../shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getJob, getJobs, updateJobStatus } from "./jobs.service";

export const jobsRoutes = new Hono();

jobsRoutes.post("/analyze", async (context) => {
  return context.json(enqueueAnalysis(true), 202);
});

jobsRoutes.get("/", zValidator("query", jobsListQuerySchema), (context) => {
  const input = context.req.valid("query");
  return context.json(getJobs(input));
});

jobsRoutes.get("/:id", (context) => {
  return context.json(getJob(context.req.param("id")));
});

jobsRoutes.patch(
  "/:id/status",
  zValidator("json", updateJobStatusSchema),
  (context) => {
    const input = context.req.valid("json");
    return context.json(updateJobStatus(context.req.param("id"), input.status));
  },
);

jobsRoutes.patch(
  "/:id/review",
  zValidator("json", z.object({ reviewed: z.boolean() })),
  (c) => {
    const job = getJob(c.req.param("id"));
    db.update(jobs)
      .set({
        reviewedAt: c.req.valid("json").reviewed
          ? new Date().toISOString()
          : null,
      })
      .where(eq(jobs.id, job.id))
      .run();
    return c.json(getJob(job.id));
  },
);
