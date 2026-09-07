import { enableAnalysis } from "../analysis/allowance";
import {
  personalContextSchema,
  type ProfileInput,
  type Profile,
} from "../../shared/contracts";
import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { jobPreferences, profileRevisions } from "./profile.tables";

const profileId = "me";

export function findProfile(): Profile | null {
  const row = db
    .select()
    .from(jobPreferences)
    .where(eq(jobPreferences.id, profileId))
    .get();
  if (!row) return null;
  return { ...row, context: personalContextSchema.parse(row.context ?? {}) };
}
export function saveProfile(input: ProfileInput): Profile {
  enableAnalysis();
  const previous = findProfile();
  const relevant = (p: ProfileInput) =>
    JSON.stringify({
      targetRoles: p.targetRoles,
      preferredSkills: p.preferredSkills,
      locationPreferences: p.locationPreferences,
      dealBreakers: p.dealBreakers,
      context: personalContextSchema.parse(p.context),
    });
  if (previous && relevant(previous) === relevant(input)) return previous;
  const row = {
    ...input,
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  db.transaction((tx) => {
    tx.insert(jobPreferences)
      .values({ ...row, id: profileId })
      .onConflictDoUpdate({ target: jobPreferences.id, set: row })
      .run();
    tx.insert(profileRevisions)
      .values({
        revision: row.revision,
        content: input,
        createdAt: row.updatedAt,
      })
      .run();
  });
  return row;
}
