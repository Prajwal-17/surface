import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  website: text("website").notNull().default(""),
  notes: text("notes").notNull().default(""),
  watchReason: text("watch_reason").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const configuredSources = sqliteTable("configured_sources", {
  scheduleHours: integer("schedule_hours").notNull().default(12),
  nextDueAt: text("next_due_at"),
  lastSuccessAt: text("last_success_at"),
  retryAt: text("retry_at"),
  failureCount: integer("failure_count").notNull().default(0),
  id: text("id").primaryKey(),
  companyId: text("company_id").references(() => companies.id),
  label: text("label").notNull(),
  url: text("url").notNull().unique(),
  endpoint: text("endpoint").notNull(),
  provider: text("provider")
    .$type<import("../../shared/contracts").SourceInspection["provider"]>()
    .notNull(),
  boardIdentity: text("board_identity"),
  support: text("support")
    .$type<import("../../shared/contracts").SourceInspection["support"]>()
    .notNull(),
  reason: text("reason").notNull(),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
