import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { jobs } from "./jobs.tables";
import { assessJobNow } from "../analysis/analysis.service";
import {
  descriptionSummarySchema,
  jobsListQuerySchema,
  updateJobStatusSchema,
  type DescriptionSummary,
} from "@surface/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { getJob, getJobs, updateJobStatus } from "./jobs.service";
import { summariseJob } from "./summary";

type SummaryStreamData =
  | { status: "complete"; summary: DescriptionSummary }
  | { status: "error"; error: string };

type SummaryMessage = UIMessage<unknown, { summary: SummaryStreamData }>;

export const jobsRoutes = new Hono();

const summaryInput = z
  .object({ regenerate: z.boolean().default(false) })
  .strict();

jobsRoutes.post(
  "/:id/summary",
  zValidator("json", summaryInput),
  async (context) =>
    context.json(
      await summariseJob(
        context.req.param("id"),
        context.req.valid("json").regenerate,
      ),
    ),
);

jobsRoutes.post(
  "/:id/summary/stream",
  zValidator("json", summaryInput),
  async (context) => {
    const id = context.req.param("id");
    const regenerate = context.req.valid("json").regenerate;
    const controller = new AbortController();
    const uiStream = createUIMessageStream<SummaryMessage>({
      async execute({ writer }) {
        writer.write({ type: "start" });
        let textStarted = false;
        let sentLength = 0;
        const endText = () => {
          if (!textStarted) return;
          writer.write({ type: "text-end", id: "summary-text" });
          textStarted = false;
        };
        try {
          const summary = await summariseJob(id, regenerate, {
            signal: controller.signal,
            onText: (text) => {
              if (!textStarted) {
                writer.write({ type: "text-start", id: "summary-text" });
                textStarted = true;
              }
              const delta = text.slice(sentLength);
              if (!delta) return;
              sentLength = text.length;
              writer.write({ type: "text-delta", id: "summary-text", delta });
            },
          });
          endText();
          writer.write({
            type: "data-summary",
            id: "summary",
            data: {
              status: "complete",
              summary: descriptionSummarySchema.parse(summary),
            },
          });
        } catch (error) {
          endText();
          writer.setOutcome({
            status: controller.signal.aborted ? "aborted" : "failed",
          });
          writer.write({
            type: "data-summary",
            id: "summary",
            data: {
              status: "error",
              error: controller.signal.aborted
                ? "The summary was stopped."
                : error instanceof Error
                  ? error.message
                  : "Could not summarise this job.",
            },
          });
        }
      },
      onError: () =>
        "The summary stream failed. Your previous summary has been retained.",
    });
    const reader = uiStream.getReader();
    const stream = new ReadableStream({
      async pull(enqueue) {
        const chunk = await reader.read();
        if (chunk.done) enqueue.close();
        else enqueue.enqueue(chunk.value);
      },
      async cancel(reason) {
        controller.abort(reason);
        await reader.cancel(reason);
      },
    });
    return createUIMessageStreamResponse({
      stream,
      keepAliveMs: 15_000,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  },
);

jobsRoutes.post("/:id/assess", async (context) => {
  const id = context.req.param("id");
  await assessJobNow(id);
  return context.json(await getJob(id));
});

jobsRoutes.get(
  "/",
  zValidator("query", jobsListQuerySchema),
  async (context) => {
    const input = context.req.valid("query");
    return context.json(await getJobs(input));
  },
);

jobsRoutes.get("/:id", async (context) => {
  return context.json(await getJob(context.req.param("id")));
});

jobsRoutes.patch(
  "/:id/status",
  zValidator("json", updateJobStatusSchema),
  async (context) => {
    const input = context.req.valid("json");
    return context.json(
      await updateJobStatus(context.req.param("id"), input.status),
    );
  },
);

jobsRoutes.patch(
  "/:id/review",
  zValidator("json", z.object({ reviewed: z.boolean() })),
  async (c) => {
    const job = await getJob(c.req.param("id"));
    await db
      .update(jobs)
      .set({
        reviewedAt: c.req.valid("json").reviewed
          ? new Date().toISOString()
          : null,
      })
      .where(eq(jobs.id, job.id));
    return c.json(await getJob(job.id));
  },
);
