import {
  jobsListQuerySchema,
  updateJobStatusSchema,
} from "../../shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  analyzeInboxJobs,
  getJob,
  getJobs,
  updateJobStatus,
} from "./jobs.service";

export const jobsRoutes = new Hono();

jobsRoutes.post("/analyze", async (context) => {
  return context.json(await analyzeInboxJobs());
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
