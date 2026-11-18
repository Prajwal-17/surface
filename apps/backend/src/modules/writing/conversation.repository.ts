import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";
import { writingConversations, writingMessages } from "./writing.tables";

export type ConversationInput = {
  company: string;
  recipientName: string;
  recipientEmail: string;
  role: string;
  whyNow: string;
  contextLink: string;
  outputType: "cold-email" | "cover-letter" | "other";
  draftSubject: string;
  draftBody: string;
};

function titleFor(
  input: Pick<ConversationInput, "company" | "recipientName" | "role">,
) {
  return (
    input.company || input.recipientName || input.role || "New opportunity"
  );
}

export async function listConversations() {
  return db
    .select()
    .from(writingConversations)
    .where(eq(writingConversations.archived, false))
    .orderBy(desc(writingConversations.updatedAt));
}

export async function createConversation(input: ConversationInput) {
  const timestamp = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    ...input,
    title: titleFor(input),
    model: null,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.insert(writingConversations).values(row);
  return row;
}

export async function getConversation(id: string) {
  const [row] = await db
    .select()
    .from(writingConversations)
    .where(
      and(
        eq(writingConversations.id, id),
        eq(writingConversations.archived, false),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "Opportunity conversation not found.");
  return row;
}

export async function updateConversation(
  id: string,
  input: Partial<ConversationInput>,
) {
  const current = await getConversation(id);
  const next = { ...current, ...input };
  const updatedAt = new Date().toISOString();
  const draftUpdatedAt =
    input.draftBody !== undefined || input.draftSubject !== undefined
      ? updatedAt
      : current.draftUpdatedAt;
  await db
    .update(writingConversations)
    .set({ ...input, title: titleFor(next), updatedAt, draftUpdatedAt })
    .where(eq(writingConversations.id, id));
  return { ...next, title: titleFor(next), updatedAt, draftUpdatedAt };
}

export async function archiveConversation(id: string) {
  await getConversation(id);
  await db
    .update(writingConversations)
    .set({ archived: true, updatedAt: new Date().toISOString() })
    .where(eq(writingConversations.id, id));
}

export async function listMessages(conversationId: string) {
  await getConversation(conversationId);
  return db
    .select()
    .from(writingMessages)
    .where(eq(writingMessages.conversationId, conversationId))
    .orderBy(asc(writingMessages.createdAt), asc(writingMessages.id));
}

export async function getMessageHistory(conversationId: string) {
  await getConversation(conversationId);
  const recent = await db
    .select({ role: writingMessages.role, content: writingMessages.content })
    .from(writingMessages)
    .where(eq(writingMessages.conversationId, conversationId))
    .orderBy(desc(writingMessages.createdAt), desc(writingMessages.id))
    .limit(40);
  return recent.toReversed().map((message) => ({
    ...message,
    content: message.content.slice(0, 10000),
  }));
}

export async function saveMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
}) {
  const timestamp = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    ...input,
    model: input.model ?? null,
    createdAt: timestamp,
  };
  await db.insert(writingMessages).values(row);
  await db
    .update(writingConversations)
    .set({
      updatedAt: timestamp,
      ...(input.model ? { model: input.model } : {}),
    })
    .where(eq(writingConversations.id, input.conversationId));
  return row;
}
