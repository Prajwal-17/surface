import { enableAnalysis } from "../analysis/settings";
import {
  personalContextSchema,
  type ProfileInput,
  type Profile,
} from "@surface/contracts";
import { lockCoordination } from "../../infrastructure/database/locks";
import { HttpError } from "../../shared/errors/http-error";
import { validateProfileLocations } from "./locations";
import { eq } from "drizzle-orm";
import { db, transaction } from "../../infrastructure/database/client";
import { jobPreferences, profileRevisions } from "./profile.tables";

const profileId = "me";

export async function findProfile(): Promise<Profile | null> {
  const row = (
    await db
      .select()
      .from(jobPreferences)
      .where(eq(jobPreferences.id, profileId))
      .limit(1)
  )[0];
  if (!row) return null;
  return { ...row, context: personalContextSchema.parse(row.context ?? {}) };
}
export async function saveProfile(
  input: ProfileInput,
  expectedRevision?: number,
): Promise<Profile> {
  return await transaction(async (tx) => {
    await lockCoordination(tx, "surface:profile-revision");
    const [current] = await tx
      .select()
      .from(jobPreferences)
      .where(eq(jobPreferences.id, profileId));
    const previous = current
      ? {
          ...current,
          context: personalContextSchema.parse(current.context ?? {}),
        }
      : null;
    if (
      expectedRevision !== undefined &&
      expectedRevision !== (previous?.revision ?? 0)
    ) {
      throw new HttpError(
        409,
        "Your profile changed in another tab. Reopen the profile to review the latest version before saving.",
      );
    }
    validateProfileLocations(input, previous);
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
    await tx
      .insert(jobPreferences)
      .values({ ...row, id: profileId })
      .onConflictDoUpdate({ target: jobPreferences.id, set: row });
    await tx
      .insert(profileRevisions)
      .values({
        revision: row.revision,
        content: input,
        createdAt: row.updatedAt,
      });
    return row;
  }).then(async (profile) => {
    await enableAnalysis();
    return profile;
  });
}
