import { and, asc, desc, eq, lte, or } from "drizzle-orm";
import { db, transaction } from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";
import {
  scheduledEmails,
  writingConversations,
  writingExamples,
  writingPreferences,
  type ScheduledEmail,
} from "./writing.tables";

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

export async function listScheduledEmails() {
  return db
    .select()
    .from(scheduledEmails)
    .orderBy(desc(scheduledEmails.scheduledAt))
    .limit(100);
}

export async function createScheduledEmail(input: {
  conversationId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  timezone: string;
}) {
  const conversation = await db
    .select({ id: writingConversations.id })
    .from(writingConversations)
    .where(eq(writingConversations.id, input.conversationId))
    .limit(1);
  if (!conversation[0]) {
    throw new HttpError(404, "Writing conversation not found.");
  }
  const scheduledTimestamp = Date.parse(input.scheduledAt);
  const now = Date.now();
  if (
    !Number.isFinite(scheduledTimestamp) ||
    scheduledTimestamp < now + 30_000 ||
    scheduledTimestamp > now + 365 * 24 * 60 * 60 * 1000
  ) {
    throw new HttpError(
      400,
      "Choose a send time at least 30 seconds from now and within one year.",
    );
  }
  const timestamp = new Date(now).toISOString();
  const row = {
    id: crypto.randomUUID(),
    ...input,
    scheduledAt: new Date(scheduledTimestamp).toISOString(),
    status: "queued",
    attempts: 0,
    error: null,
    sentAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies typeof scheduledEmails.$inferInsert;
  await db.insert(scheduledEmails).values(row);
  return row;
}

export async function cancelScheduledEmail(id: string) {
  const timestamp = new Date().toISOString();
  const changed = await db
    .update(scheduledEmails)
    .set({ status: "cancelled", updatedAt: timestamp })
    .where(
      and(eq(scheduledEmails.id, id), eq(scheduledEmails.status, "queued")),
    )
    .returning({ id: scheduledEmails.id });
  if (!changed[0]) {
    const existing = await db
      .select({ status: scheduledEmails.status })
      .from(scheduledEmails)
      .where(eq(scheduledEmails.id, id))
      .limit(1);
    if (!existing[0]) throw new HttpError(404, "Scheduled email not found.");
    throw new HttpError(409, "This email is no longer waiting to send.");
  }
  return { cancelled: true };
}

export async function retryScheduledEmail(id: string) {
  const timestamp = new Date().toISOString();
  const changed = await db
    .update(scheduledEmails)
    .set({
      status: "queued",
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      attempts: 0,
      error: null,
      sentAt: null,
      updatedAt: timestamp,
    })
    .where(
      and(eq(scheduledEmails.id, id), eq(scheduledEmails.status, "failed")),
    )
    .returning({ id: scheduledEmails.id });
  if (!changed[0]) {
    const existing = await db
      .select({ status: scheduledEmails.status })
      .from(scheduledEmails)
      .where(eq(scheduledEmails.id, id))
      .limit(1);
    if (!existing[0]) throw new HttpError(404, "Scheduled email not found.");
    throw new HttpError(409, "Only failed emails can be retried.");
  }
  return { queued: true };
}

/** Claim due messages atomically so two desktop workers cannot send one job. */
export async function claimDueScheduledEmails(now = new Date()) {
  return transaction(async (tx) => {
    const timestamp = now.toISOString();
    const staleBefore = new Date(now.getTime() - 5 * 60_000).toISOString();
    const due = await tx
      .select()
      .from(scheduledEmails)
      .where(
        and(
          lte(scheduledEmails.scheduledAt, timestamp),
          or(
            eq(scheduledEmails.status, "queued"),
            and(
              eq(scheduledEmails.status, "processing"),
              lte(scheduledEmails.updatedAt, staleBefore),
            ),
          ),
        ),
      )
      .orderBy(asc(scheduledEmails.scheduledAt))
      .limit(20);
    const claimed: ScheduledEmail[] = [];
    for (const row of due) {
      const updated = await tx
        .update(scheduledEmails)
        .set({
          status: "processing",
          attempts: row.attempts + 1,
          error: null,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(scheduledEmails.id, row.id),
            or(
              eq(scheduledEmails.status, "queued"),
              and(
                eq(scheduledEmails.status, "processing"),
                lte(scheduledEmails.updatedAt, staleBefore),
              ),
            ),
          ),
        )
        .returning();
      if (updated[0]) claimed.push(updated[0]);
    }
    return claimed;
  });
}

export async function recordScheduledEmailResult(
  id: string,
  result:
    | { status: "sent" }
    | { status: "failed"; error: string }
    | { status: "uncertain"; error: string },
) {
  const rows = await db
    .select()
    .from(scheduledEmails)
    .where(eq(scheduledEmails.id, id))
    .limit(1);
  const current = rows[0];
  if (!current) throw new HttpError(404, "Scheduled email not found.");
  if (current.status !== "processing") {
    throw new HttpError(409, "This email is not currently being sent.");
  }
  const now = new Date();
  if (result.status === "sent") {
    await db
      .update(scheduledEmails)
      .set({
        status: "sent",
        error: null,
        sentAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .where(eq(scheduledEmails.id, id));
    return { status: "sent" as const };
  }
  if (result.status === "uncertain") {
    await db
      .update(scheduledEmails)
      .set({
        status: "uncertain",
        error: result.error.slice(0, 1000),
        updatedAt: now.toISOString(),
      })
      .where(eq(scheduledEmails.id, id));
    return { status: "uncertain" as const };
  }

  const retryDelay = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000][
    current.attempts - 1
  ];
  const terminal = current.attempts >= 5;
  await db
    .update(scheduledEmails)
    .set({
      status: terminal ? "failed" : "queued",
      scheduledAt: terminal
        ? current.scheduledAt
        : new Date(now.getTime() + (retryDelay ?? 30 * 60_000)).toISOString(),
      error: result.error.slice(0, 1000),
      updatedAt: now.toISOString(),
    })
    .where(eq(scheduledEmails.id, id));
  return { status: terminal ? ("failed" as const) : ("queued" as const) };
}
