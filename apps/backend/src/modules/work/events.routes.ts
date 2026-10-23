import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { pg } from "../../infrastructure/database/client";
export async function workspaceRevision(): Promise<string> {
  const [row] = await pg`
    SELECT (SELECT count(*)::integer FROM job_versions) versions,
      (SELECT count(*)::integer FROM assessments) assessments,
      (SELECT coalesce(max(revision),0) FROM job_preferences) profile,
      (SELECT count(*)::integer FROM job_sources) sources,
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
