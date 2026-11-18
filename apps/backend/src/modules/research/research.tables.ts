import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { companies } from "../workspace/workspace.tables";
import type { VerifiedCompanyLink, ResearchSource } from "@surface/contracts";

const companyId = () =>
  text("company_id")
    .notNull()
    .references(() => companies.id);

export const researchRuns = sqliteTable(
  "research_runs",
  {
    id: text("id").primaryKey(),
    companyId: companyId(),
    kind: text("kind")
      .$type<"report" | "question" | "links" | "summary">()
      .notNull(),
    state: text("state")
      .$type<
        | "running"
        | "completed"
        | "partial"
        | "failed"
        | "cancelled"
        | "interrupted"
      >()
      .notNull(),
    draft: text("draft").notNull().default(""),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("research_active_company")
      .on(table.companyId)
      .where(sql`${table.state} = 'running'`),
  ],
);

export const researchSources = sqliteTable(
  "research_sources",
  {
    id: text("id").primaryKey(),
    companyId: companyId(),
    runId: text("run_id")
      .notNull()
      .references(() => researchRuns.id),
    url: text("url").notNull(),
    title: text("title").notNull(),
    kind: text("kind").$type<"search" | "page">().notNull(),
    text: text("text").notNull(),
    links: text("links", { mode: "json" })
      .$type<ResearchSource["links"]>()
      .notNull(),
    status: text("status").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (table) => [index("research_sources_company").on(table.companyId)],
);

export const researchReports = sqliteTable(
  "research_reports",
  {
    id: text("id").primaryKey(),
    companyId: companyId(),
    runId: text("run_id")
      .notNull()
      .references(() => researchRuns.id),
    markdown: text("markdown").notNull(),
    sourceIds: text("source_ids", { mode: "json" }).$type<string[]>().notNull(),
    model: text("model").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("research_reports_company").on(table.companyId)],
);

export const researchMessages = sqliteTable("research_messages", {
  id: text("id").primaryKey(),
  companyId: companyId(),
  runId: text("run_id")
    .notNull()
    .references(() => researchRuns.id),
  question: text("question").notNull(),
  answer: text("answer"),
  webSearch: integer("web_search", { mode: "boolean" }).notNull(),
  sourceIds: text("source_ids", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: text("created_at").notNull(),
});

export const researchEvents = sqliteTable(
  "research_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => researchRuns.id),
    type: text("type").$type<"progress" | "text" | "done">().notNull(),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("research_events_run").on(table.runId, table.id)],
);

export const companyLinkReviews = sqliteTable("company_link_reviews", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id),
  runId: text("run_id")
    .notNull()
    .references(() => researchRuns.id),
  links: text("links", { mode: "json" })
    .$type<VerifiedCompanyLink[]>()
    .notNull(),
  checkedAt: text("checked_at").notNull(),
});
