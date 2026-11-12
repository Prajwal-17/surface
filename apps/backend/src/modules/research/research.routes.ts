import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../infrastructure/database/client";
import {
  researchCandidateSchema,
  researchQuestionInputSchema,
} from "@surface/contracts";
import {
  cancelResearch,
  company,
  confirmCompany,
  details,
  library,
  resolveCompany,
  startResearch,
} from "./research.service";
import { researchEvents, researchRuns } from "./research.tables";
import { HttpError } from "../../shared/errors/http-error";
export const researchRoutes = new Hono();
researchRoutes.get("/research", async (c) => c.json(await library()));
researchRoutes.post(
  "/research/resolve",
  zValidator("json", z.object({ query: z.string().trim().min(1).max(2048) })),
  async (c) => c.json(await resolveCompany(c.req.valid("json").query)),
);
researchRoutes.post(
  "/research/confirm",
  zValidator("json", researchCandidateSchema),
  async (c) => c.json(await confirmCompany(c.req.valid("json"))),
);
researchRoutes.get("/companies/:id/research", async (c) =>
  c.json(await details(c.req.param("id"))),
);
researchRoutes.post("/companies/:id/research/links", async (c) =>
  c.json(await startResearch(c.req.param("id"), undefined, "links"), 202),
);
researchRoutes.post("/companies/:id/research/summary", async (c) =>
  c.json(await startResearch(c.req.param("id"), undefined, "summary"), 202),
);
researchRoutes.post("/companies/:id/research", async (c) =>
  c.json(await startResearch(c.req.param("id")), 202),
);
researchRoutes.post(
  "/companies/:id/research/questions",
  zValidator("json", researchQuestionInputSchema),
  async (c) =>
    c.json(await startResearch(c.req.param("id"), c.req.valid("json")), 202),
);
researchRoutes.post("/companies/:id/research/runs/:runId/cancel", async (c) =>
  c.json(await cancelResearch(c.req.param("id"), c.req.param("runId"))),
);
researchRoutes.get("/companies/:id/research/runs/:runId/events", async (c) => {
  const companyId = c.req.param("id"),
    runId = c.req.param("runId");
  await company(companyId);
  const run = (
    await db
      .select()
      .from(researchRuns)
      .where(
        and(eq(researchRuns.id, runId), eq(researchRuns.companyId, companyId)),
      )
      .limit(1)
  )[0];
  if (!run) throw new HttpError(404, "Research run not found.");
  let after = Number(
    c.req.header("Last-Event-ID") || c.req.query("after") || 0,
  );
  if (!Number.isSafeInteger(after) || after < 0)
    throw new HttpError(400, "Invalid event cursor.");
  return streamSSE(c, async (stream) => {
    let aborted = false;
    stream.onAbort(() => {
      aborted = true;
    });
    for (;;) {
      if (aborted) break;
      const events = await db
        .select()
        .from(researchEvents)
        .where(
          and(eq(researchEvents.runId, runId), gt(researchEvents.id, after)),
        )
        .orderBy(researchEvents.id)
        .limit(100);
      for (const row of events) {
        await stream.writeSSE({
          id: String(row.id),
          event: row.type,
          data: JSON.stringify(row),
        });
        after = row.id;
      }
      if (events.length === 100) continue;
      const state = (
        await db
          .select()
          .from(researchRuns)
          .where(eq(researchRuns.id, runId))
          .limit(1)
      )[0]?.state;
      if (state !== "running") {
        await stream.writeSSE({
          event: "end",
          data: JSON.stringify({ state }),
        });
        break;
      }
      await stream.writeSSE({ event: "heartbeat", data: "{}" });
      await stream.sleep(1000);
    }
  });
});
