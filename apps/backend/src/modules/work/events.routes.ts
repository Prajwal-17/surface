import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { sqlite } from "../../infrastructure/database/client";
export function workspaceRevision(): string {
  const row = sqlite
    .query(
      "SELECT (SELECT count(*) FROM job_versions) versions, (SELECT count(*) FROM assessments) assessments, (SELECT coalesce(max(revision),0) FROM job_preferences) profile, (SELECT count(*) FROM job_sources) sources, (SELECT coalesce(max(updated_at),'') FROM jobs) updated",
    )
    .get();
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
      const revision = workspaceRevision();
      if (revision !== previous) {
        await stream.writeSSE({ event: "revision", data: revision });
        previous = revision;
      }
      await stream.sleep(2000);
    }
  }),
);
