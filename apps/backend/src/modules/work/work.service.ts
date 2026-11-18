import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db, transaction } from "../../infrastructure/database/client";
import { configuredSources } from "../workspace/workspace.tables";
import { runs, workItems, runItems } from "./work.tables";
import { HttpError } from "../../shared/errors/http-error";
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
      (i) => i.state === "queued" || i.state === "running",
    );
    const state = active
      ? items.some((i) => i.state === "running")
        ? "running"
        : "queued"
      : items.every((i) => i.state === "completed")
        ? "completed"
        : items.some((i) => i.state === "completed" || i.state === "partial")
          ? "partial"
          : items.some((i) => i.state === "failed")
            ? "failed"
            : "interrupted";
    await db
      .update(runs)
      .set({ state, completedAt: active ? null : new Date().toISOString() })
      .where(eq(runs.id, run.id));
  }
}
export async function enqueueCollection(
  sourceIds: string[],
  label = "Manual refresh",
) {
  return await transaction(async (tx) => {
    const now = new Date().toISOString(),
      id = crypto.randomUUID();
    const sources = await tx
      .select()
      .from(configuredSources)
      .where(inArray(configuredSources.id, [...new Set(sourceIds)]));
    if (!sources.length || sources.length !== new Set(sourceIds).size)
      throw new HttpError(400, "Choose valid configured sources.");
    const activeRuns = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.kind, "collection"),
          eq(runs.label, label),
          inArray(runs.state, ["queued", "running"]),
        ),
      )
      .orderBy(desc(runs.createdAt));
    const requested = new Set(sourceIds);
    for (const active of activeRuns) {
      const attached = await tx
        .select({ sourceId: workItems.sourceId })
        .from(runItems)
        .innerJoin(workItems, eq(runItems.workId, workItems.id))
        .where(eq(runItems.runId, active.id));
      if (
        attached.length === requested.size &&
        attached.every((item) => item.sourceId && requested.has(item.sourceId))
      ) {
        return { runId: active.id };
      }
    }
    await tx.insert(runs).values({
      id,
      kind: "collection",
      label,
      state: "queued",
      createdAt: now,
    });
    for (const source of sources) {
      if (source.paused || source.support === "unsupported")
        throw new HttpError(
          409,
          source.support === "unsupported"
            ? source.reason
            : "Resume the source before collecting.",
        );
      const identity = `source:${source.id}`;
      let work = (
        await tx
          .select()
          .from(workItems)
          .where(
            and(
              eq(workItems.identity, identity),
              inArray(workItems.state, ["queued", "running"]),
            ),
          )
          .limit(1)
      )[0];
      if (
        !work &&
        source.lastSuccessAt &&
        Date.now() - Date.parse(source.lastSuccessAt) <
          minimumFetchHours(source.provider) * 3600000
      ) {
        work = (
          await tx
            .select()
            .from(workItems)
            .where(
              and(
                eq(workItems.identity, identity),
                eq(workItems.state, "completed"),
              ),
            )
            .orderBy(desc(workItems.completedAt))
            .limit(1)
        )[0];
      }
      if (!work) {
        const retryAt =
          source.retryAt && source.retryAt > now ? source.retryAt : now;
        work = (
          await tx
            .insert(workItems)
            .values({
              id: crypto.randomUUID(),
              kind: "collection",
              sourceId: source.id,
              identity,
              state: "queued",
              retryAt,
              createdAt: now,
            })
            .returning()
        )[0]!;
      }
      await tx.insert(runItems).values({ runId: id, workId: work.id });
    }
    return { runId: id };
  });
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
  ).map((r) => r.work);
  return { ...run, items };
}
export async function enqueueDueSchedules(now = new Date()) {
  const stamp = now.toISOString();
  const dueSources = await db
    .select()
    .from(configuredSources)
    .where(
      and(
        eq(configuredSources.paused, false),
        eq(configuredSources.support, "supported"),
        sql`${configuredSources.scheduleHours} > 0`,
        or(
          lte(configuredSources.nextDueAt, stamp),
          sql`${configuredSources.nextDueAt} IS NULL`,
        ),
      ),
    );
  if (dueSources.length) {
    try {
      await enqueueCollection(
        dueSources.map((source) => source.id),
        "Scheduled portal refresh",
      );
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }
  }
  for (const source of dueSources) {
    await db
      .update(configuredSources)
      .set({
        nextDueAt: new Date(
          now.getTime() +
            Math.max(source.scheduleHours, minimumFetchHours(source.provider)) *
              3600000,
        ).toISOString(),
      })
      .where(eq(configuredSources.id, source.id));
  }
}
