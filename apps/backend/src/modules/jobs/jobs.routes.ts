import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { jobs } from "./jobs.tables";
import { assessJobNow } from "../analysis/analysis.service";
import {
  jobsListQuerySchema,
  updateJobStatusSchema,
} from "../../shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { getJob, getJobs, updateJobStatus } from "./jobs.service";
import { summariseJob } from "./summary";

export const jobsRoutes = new Hono();

jobsRoutes.post(
  "/:id/summary",
  zValidator(
    "json",
    z.object({ regenerate: z.boolean().default(false) }).strict(),
  ),
  async (context) => {
    if (context.req.header("Accept") === "application/x-ndjson") {
      context.header("Content-Type", "application/x-ndjson");
      context.header("Cache-Control", "no-cache, no-transform");
      context.header("X-Accel-Buffering", "no");
      return stream(context, async (output) => {
        let previousText = "";
        // Flush headers and keep the connection alive while the provider prepares its first token.
        await output.writeln("");
        const heartbeat = setInterval(() => {
          void output.writeln("").catch(() => {});
        }, 5000);
        output.onAbort(() => clearInterval(heartbeat));
        try {
          const summary = await summariseJob(
            context.req.param("id"),
            context.req.valid("json").regenerate,
            undefined,
            undefined,
            (text) => {
              const delta = text.slice(previousText.length);
              previousText = text;
              if (delta)
                void output
                  .writeln(JSON.stringify({ type: "text", text: delta }))
                  .catch(() => {});
            },
          );
          await output.writeln(JSON.stringify({ type: "complete", summary }));
        } catch (error) {
          await output.writeln(
            JSON.stringify({
              type: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "Could not summarise this job.",
            }),
          );
        } finally {
          clearInterval(heartbeat);
        }
      });
    }
    return context.json(
      await summariseJob(
        context.req.param("id"),
        context.req.valid("json").regenerate,
      ),
    );
  },
);

jobsRoutes.post("/:id/assess", async (context) => {
  const id = context.req.param("id");
  await assessJobNow(id);
  return context.json(getJob(id));
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
