import { asc, eq } from "drizzle-orm";
import { db, transaction } from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";
import { writingExamples, writingPreferences } from "./writing.tables";

const profileId = "me";

export async function getWritingContext() {
  const [preferences, examples] = await Promise.all([
    db
      .select()
      .from(writingPreferences)
      .where(eq(writingPreferences.id, profileId))
      .limit(1),
    db
      .select()
      .from(writingExamples)
      .orderBy(asc(writingExamples.sortOrder), asc(writingExamples.createdAt)),
  ]);
  return {
    guide: preferences[0]?.guide ?? "",
    updatedAt: preferences[0]?.updatedAt ?? null,
    examples,
  };
}

export async function saveWritingGuide(guide: string) {
  const updatedAt = new Date().toISOString();
  await db
    .insert(writingPreferences)
    .values({ id: profileId, guide, updatedAt })
    .onConflictDoUpdate({
      target: writingPreferences.id,
      set: { guide, updatedAt },
    });
  return { guide, updatedAt };
}

export async function createWritingExample(input: {
  label: string;
  content: string;
  notes: string;
}) {
  const examples = await db
    .select({ sortOrder: writingExamples.sortOrder })
    .from(writingExamples)
    .orderBy(asc(writingExamples.sortOrder));
  const timestamp = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    ...input,
    sortOrder:
      examples.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.insert(writingExamples).values(row);
  return row;
}

export async function updateWritingExample(
  id: string,
  input: { label: string; content: string; notes: string },
) {
  const current = await db
    .select()
    .from(writingExamples)
    .where(eq(writingExamples.id, id))
    .limit(1);
  if (!current[0]) throw new HttpError(404, "Writing example not found.");
  const updatedAt = new Date().toISOString();
  await db
    .update(writingExamples)
    .set({ ...input, updatedAt })
    .where(eq(writingExamples.id, id));
  return { ...current[0], ...input, updatedAt };
}

export async function deleteWritingExample(id: string) {
  const current = await db
    .select({ id: writingExamples.id })
    .from(writingExamples)
    .where(eq(writingExamples.id, id))
    .limit(1);
  if (!current[0]) throw new HttpError(404, "Writing example not found.");
  await db.delete(writingExamples).where(eq(writingExamples.id, id));
}

export async function reorderWritingExamples(ids: string[]) {
  const current = await db
    .select({ id: writingExamples.id })
    .from(writingExamples);
  const currentIds = new Set(current.map((example) => example.id));
  if (
    ids.length !== currentIds.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !currentIds.has(id))
  ) {
    throw new HttpError(
      409,
      "The writing examples changed. Reload and try again.",
    );
  }
  const updatedAt = new Date().toISOString();
  await transaction(async (tx) => {
    for (const [sortOrder, id] of ids.entries()) {
      await tx
        .update(writingExamples)
        .set({ sortOrder, updatedAt })
        .where(eq(writingExamples.id, id));
    }
  });
  return { reordered: true };
}
