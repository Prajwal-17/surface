import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { rawQuery } from "../../infrastructure/database/client";
export async function workspaceRevision(): Promise<string> {
  const [row] = await rawQuery`
    SELECT (SELECT CAST(count(*) AS INTEGER) FROM job_versions) versions,
      (SELECT CAST(count(*) AS INTEGER) FROM assessments) assessments,
      (SELECT coalesce(max(revision),0) FROM job_preferences) profile,
      (SELECT CAST(count(*) AS INTEGER) FROM job_sources) sources,
      (SELECT coalesce(max(updated_at),'') FROM jobs) updated`;
  return JSON.stringify(row);
}
export const eventsRoutes = new Hono();
eventsRoutes.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    let previous = "";
    let aborted = false;
    stream.onAbort(() => {
      aborted = true;
    });
    for (;;) {
      if (aborted) break;
      const revision = await workspaceRevision();
      if (revision !== previous) {
        await stream.writeSSE({ event: "revision", data: revision });
        previous = revision;
      }
      await stream.sleep(2000);
    }
  }),
);
