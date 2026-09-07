import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { env } from "../../config/env";
import { analysisSettings, aiUsage } from "./analysis.tables";
import { workItems } from "../work/work.tables";
import type { z } from "zod";
import type { analysisSettingsInputSchema } from "../../shared/contracts";
export function nextReset(timezone: string, now = Date.now()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);
  let low = now,
    high = now + 36 * 3600000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (formatter.format(middle) === today) low = middle;
    else high = middle;
  }
  return new Date(high).toISOString();
}
export function getSettings() {
  db.insert(analysisSettings)
    .values({
      id: "me",
      timezone: process.env.TZ || "Asia/Kolkata",
      nextResetAt: nextReset(process.env.TZ || "Asia/Kolkata"),
    })
    .onConflictDoNothing()
    .run();
  let row = db
    .select()
    .from(analysisSettings)
    .where(eq(analysisSettings.id, "me"))
    .get()!;
  if (row.nextResetAt <= new Date().toISOString()) {
    db.update(analysisSettings)
      .set({ used: 0, nextResetAt: nextReset(row.timezone) })
      .where(
        and(
          eq(analysisSettings.id, "me"),
          eq(analysisSettings.nextResetAt, row.nextResetAt),
        ),
      )
      .run();
    row = db
      .select()
      .from(analysisSettings)
      .where(eq(analysisSettings.id, "me"))
      .get()!;
  }
  const queued = db
    .select({ n: count() })
    .from(workItems)
    .where(and(eq(workItems.kind, "analysis"), eq(workItems.state, "queued")))
    .get()!.n;
  return { ...row, configured: Boolean(env.OMNIROUTE_API_KEY), queued };
}
export function saveSettings(
  input: z.infer<typeof analysisSettingsInputSchema>,
) {
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
export function reserveRequest(
  workId: string,
  configured = Boolean(env.OMNIROUTE_API_KEY),
): string | null {
  return db.transaction((tx) => {
    const settings = getSettings();
    if (!configured || !settings.enabled || settings.paused) return null;
    const claimed = tx
      .update(analysisSettings)
      .set({ used: sql`${analysisSettings.used} + 1` })
      .where(
        and(
          eq(analysisSettings.id, "me"),
          sql`${analysisSettings.used} < ${analysisSettings.dailyLimit}`,
        ),
      )
      .returning()
      .get();
    if (!claimed) return null;
    const id = crypto.randomUUID();
    tx.insert(aiUsage)
      .values({
        id,
        workId,
        dispatchedAt: new Date().toISOString(),
        resetAt: settings.nextResetAt,
      })
      .run();
    return id;
  });
}
