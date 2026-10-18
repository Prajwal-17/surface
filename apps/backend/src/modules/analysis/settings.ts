import { modelCapacityAvailable } from "../../shared/model-client";
import { and, count, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { env } from "../../config/env";
import { analysisSettings } from "./analysis.tables";
import { workItems } from "../work/work.tables";

export function getSettings() {
  db.insert(analysisSettings).values({ id: "me" }).onConflictDoNothing().run();
  const row = db
    .select()
    .from(analysisSettings)
    .where(eq(analysisSettings.id, "me"))
    .get()!;
  const queued = db
    .select({ n: count() })
    .from(workItems)
    .where(and(eq(workItems.kind, "analysis"), eq(workItems.state, "queued")))
    .get()!.n;
  return { ...row, configured: Boolean(env.OMNIROUTE_API_KEY), queued };
}
export function saveSettings(input: { paused: boolean }) {
  getSettings();
  db.update(analysisSettings)
    .set(input)
    .where(eq(analysisSettings.id, "me"))
    .run();
  return getSettings();
}
export function enableAnalysis() {
  getSettings();
  db.update(analysisSettings)
    .set({ enabled: true })
    .where(eq(analysisSettings.id, "me"))
    .run();
}
export function canRequestModel(
  configured = Boolean(env.OMNIROUTE_API_KEY),
  manual = false,
) {
  const settings = getSettings();
  return (
    configured &&
    modelCapacityAvailable() &&
    (manual || (settings.enabled && !settings.paused))
  );
}
