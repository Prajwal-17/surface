import { eq, inArray } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";
import { runs, runItems, workItems } from "./work.tables";

export const minimumFetchHours = (_provider: string) => 6;

export async function syncRuns() {
  for (const run of await db
    .select()
    .from(runs)
    .where(inArray(runs.state, ["queued", "running"]))) {
    const items = await db
      .select({ state: workItems.state })
      .from(runItems)
      .innerJoin(workItems, eq(runItems.workId, workItems.id))
      .where(eq(runItems.runId, run.id));
    const active = items.some(
      (item) => item.state === "queued" || item.state === "running",
    );
    const state = active
      ? items.some((item) => item.state === "running")
        ? "running"
        : "queued"
      : items.every((item) => item.state === "completed")
        ? "completed"
        : items.some(
              (item) => item.state === "completed" || item.state === "partial",
            )
          ? "partial"
          : items.some((item) => item.state === "failed")
            ? "failed"
            : "interrupted";
    await db
      .update(runs)
      .set({ state, completedAt: active ? null : new Date().toISOString() })
      .where(eq(runs.id, run.id));
  }
}

export async function getRun(id: string) {
  await syncRuns();
  const run = (await db.select().from(runs).where(eq(runs.id, id)).limit(1))[0];
  if (!run) throw new HttpError(404, "Run not found.");
  const items = (
    await db
      .select({ work: workItems })
      .from(runItems)
      .innerJoin(workItems, eq(runItems.workId, workItems.id))
      .where(eq(runItems.runId, id))
  ).map((row) => row.work);
  return { ...run, items };
}
