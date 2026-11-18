import type { OutreachTarget } from "@surface/contracts";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const outreachDrafts = sqliteTable(
  "outreach_drafts",
  {
    id: text("id").primaryKey(),
    target: text("target").$type<OutreachTarget>().notNull(),
    targetId: text("target_id").notNull(),
    to: text("recipient").notNull().default(""),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    writingExamples: text("writing_examples").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("outreach_target_unique").on(table.target, table.targetId),
  ],
);
