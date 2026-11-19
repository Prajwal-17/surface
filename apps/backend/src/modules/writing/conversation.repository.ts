import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
  fallback = "New conversation",
) {
  return input.company || input.recipientName || input.role || fallback;
}

function titleFromMessage(content: string) {
  const attachmentName = content.match(/\[Attached: ([^\]]+)\]/u)?.[1];
  const prompt = content.replace(/\n*\[Attached:[\s\S]*$/u, " ").trim();
  const firstSentence = prompt.split(/(?<=[.!?])\s+/u, 1)[0]?.trim();
  const source =
    firstSentence || (attachmentName ? `Review ${attachmentName}` : "");
  if (!source) return "New conversation";

  const title = source.charAt(0).toLocaleUpperCase() + source.slice(1);
  if (
    /^(hi|hey|hello|test|help|can you help|what can you do)[.!?]*$/iu.test(
      title,
    )
  ) {
    return "New conversation";
  }
  if (title.length <= 56) return title;

  const shortened = title.slice(0, 53);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 30 ? lastSpace : 53).trimEnd()}…`;
}

export async function listConversations() {
  const conversations = await db
    .select()
    .from(writingConversations)
    .orderBy(desc(writingConversations.updatedAt));
  if (!conversations.length) return conversations;

  const firstUserMessages = await db
    .select({
      conversationId: writingMessages.conversationId,
      content: writingMessages.content,
    })
    .from(writingMessages)
    .where(
      and(
        eq(writingMessages.role, "user"),
        inArray(
          writingMessages.conversationId,
          conversations.map((conversation) => conversation.id),
        ),
      ),
    )
    .orderBy(asc(writingMessages.createdAt), asc(writingMessages.id));
  const titles = new Map<string, string>();
  for (const message of firstUserMessages) {
    const title = titleFromMessage(message.content);
    if (title !== "New conversation" && !titles.has(message.conversationId)) {
      titles.set(message.conversationId, title);
    }
  }

  return conversations.map((conversation) => {
    if (
      conversation.title !== "New opportunity" &&
      conversation.title !== "New conversation"
    ) {
      return conversation;
    }
    const title = titleFor(
      conversation,
      titles.get(conversation.id) ?? conversation.title,
    );
    return title === conversation.title
      ? conversation
      : { ...conversation, title };
  });
}

export async function createConversation(input: ConversationInput) {
  const timestamp = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    ...input,
    title: titleFor(input),
    model: null,
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
    .where(eq(writingConversations.id, id))
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
  const titleWasContext = [
    current.company,
    current.recipientName,
    current.role,
  ].some((value) => value && value === current.title);
  const fallbackTitle = titleWasContext ? "New conversation" : current.title;
  const title = titleFor(next, fallbackTitle);
  const updatedAt = new Date().toISOString();
  const draftUpdatedAt =
    input.draftBody !== undefined || input.draftSubject !== undefined
      ? updatedAt
      : current.draftUpdatedAt;
  await db
    .update(writingConversations)
    .set({ ...input, title, updatedAt, draftUpdatedAt })
    .where(eq(writingConversations.id, id));
  return { ...next, title, updatedAt, draftUpdatedAt };
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
  let generatedTitle: string | null = null;
  if (input.role === "user") {
    const conversation = await getConversation(input.conversationId);
    if (
      conversation.title === "New opportunity" ||
      conversation.title === "New conversation"
    ) {
      const previousUserMessages = await db
        .select({ content: writingMessages.content })
        .from(writingMessages)
        .where(
          and(
            eq(writingMessages.conversationId, input.conversationId),
            eq(writingMessages.role, "user"),
          ),
        )
        .orderBy(asc(writingMessages.createdAt), asc(writingMessages.id));
      const hasUsefulTitle = previousUserMessages.some(
        (message) => titleFromMessage(message.content) !== "New conversation",
      );
      const candidateTitle = titleFromMessage(input.content);
      if (!hasUsefulTitle && candidateTitle !== "New conversation") {
        generatedTitle = titleFor(conversation, candidateTitle);
      }
    }
  }
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
      ...(generatedTitle ? { title: generatedTitle } : {}),
      ...(input.model ? { model: input.model } : {}),
    })
    .where(eq(writingConversations.id, input.conversationId));
  return row;
}
