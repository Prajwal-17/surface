import { and, count, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { aiConfigured, getAiSettings } from "../../config/runtime";
import { modelCapacityAvailable } from "../../shared/ai/capacity";
import { analysisSettings } from "./analysis.tables";
import { workItems } from "../work/work.tables";

export async function getSettings() {
  await db.insert(analysisSettings).values({ id: "me" }).onConflictDoNothing();
  const row = (
    await db
      .select()
      .from(analysisSettings)
      .where(eq(analysisSettings.id, "me"))
      .limit(1)
  )[0]!;
  const queued = (
    await db
      .select({ n: count() })
      .from(workItems)
      .where(and(eq(workItems.kind, "analysis"), eq(workItems.state, "queued")))
      .limit(1)
  )[0]!.n;
  return {
    ...row,
    configured: aiConfigured(),
    queued,
  };
}
export async function saveSettings(input: { paused: boolean }) {
  await getSettings();
  await db
    .update(analysisSettings)
    .set(input)
    .where(eq(analysisSettings.id, "me"));
  return await getSettings();
}
export async function enableAnalysis() {
  await getSettings();
  await db
    .update(analysisSettings)
    .set({ enabled: true })
    .where(eq(analysisSettings.id, "me"));
}
export async function canRequestModel(
  configured = aiConfigured(getAiSettings()),
  manual = false,
) {
  const settings = await getSettings();
  return (
    configured &&
    modelCapacityAvailable() &&
    (manual || (settings.enabled && !settings.paused))
  );
}
