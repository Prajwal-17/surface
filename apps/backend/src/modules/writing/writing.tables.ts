import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const writingPreferences = sqliteTable("writing_preferences", {
  id: text("id").primaryKey(),
  guide: text("guide").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const writingExamples = sqliteTable("writing_examples", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  content: text("content").notNull(),
  notes: text("notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const writingConversations = sqliteTable("writing_conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull().default(""),
  recipientName: text("recipient_name").notNull().default(""),
  recipientEmail: text("recipient_email").notNull().default(""),
  role: text("role").notNull().default(""),
  whyNow: text("why_now").notNull().default(""),
  contextLink: text("context_link").notNull().default(""),
  outputType: text("output_type").notNull().default("cold-email"),
  draftSubject: text("draft_subject").notNull().default(""),
  draftBody: text("draft_body").notNull().default(""),
  draftUpdatedAt: text("draft_updated_at"),
  model: text("model"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const writingMessages = sqliteTable("writing_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => writingConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  model: text("model"),
  createdAt: text("created_at").notNull(),
});

export const scheduledEmails = sqliteTable("scheduled_emails", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => writingConversations.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  timezone: text("timezone").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type WritingExample = typeof writingExamples.$inferSelect;
export type WritingConversation = typeof writingConversations.$inferSelect;
export type WritingMessage = typeof writingMessages.$inferSelect;
export type ScheduledEmail = typeof scheduledEmails.$inferSelect;
