import type { OutreachTarget } from "@surface/contracts";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import {
  sqliteTable,
  text as sqliteText,
  uniqueIndex as sqliteUniqueIndex,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";

const pgOutreachDrafts = pgTable(
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

export const sqliteOutreachDrafts = sqliteTable(
  "outreach_drafts",
  {
    id: sqliteText("id").primaryKey(),
    target: sqliteText("target").$type<OutreachTarget>().notNull(),
    targetId: sqliteText("target_id").notNull(),
    to: sqliteText("recipient").notNull().default(""),
    subject: sqliteText("subject").notNull().default(""),
    body: sqliteText("body").notNull().default(""),
    writingExamples: sqliteText("writing_examples").notNull().default(""),
    updatedAt: sqliteText("updated_at").notNull(),
  },
  (table) => [
    sqliteUniqueIndex("outreach_target_unique").on(
      table.target,
      table.targetId,
    ),
  ],
);

export const outreachDrafts =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteOutreachDrafts as unknown as typeof pgOutreachDrafts)
    : pgOutreachDrafts;
