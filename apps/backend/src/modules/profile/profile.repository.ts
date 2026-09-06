import type {
  JobPreferences,
  JobPreferencesInput,
} from "../../shared/contracts";
import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { jobPreferences } from "./profile.tables";

const profileId = "me";

export function findJobPreferences(): JobPreferences | null {
  const row = db
    .select()
    .from(jobPreferences)
    .where(eq(jobPreferences.id, profileId))
    .get();

  if (!row) return null;

  return {
    targetRoles: row.targetRoles,
    preferredSkills: row.preferredSkills,
    locationPreferences: row.locationPreferences,
    dealBreakers: row.dealBreakers,
    updatedAt: row.updatedAt,
  };
}

export function upsertJobPreferences(
  input: JobPreferencesInput,
): JobPreferences {
  const updatedAt = new Date().toISOString();

  db.insert(jobPreferences)
    .values({ id: profileId, ...input, updatedAt })
    .onConflictDoUpdate({
      target: jobPreferences.id,
      set: { ...input, updatedAt },
    })
    .run();

  return { ...input, updatedAt };
}
