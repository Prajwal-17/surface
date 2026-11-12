import {
  serial,
  boolean,
  jsonb,
  pgTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "../workspace/workspace.tables";
import type { VerifiedCompanyLink, ResearchSource } from "@surface/contracts";
const companyId = () =>
  text("company_id")
    .notNull()
    .references(() => companies.id);
export const researchRuns = pgTable(
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
  (t) => [
    uniqueIndex("research_active_company")
      .on(t.companyId)
      .where(sql`${t.state} = 'running'`),
  ],
);
export const researchSources = pgTable(
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
    links: jsonb("links").$type<ResearchSource["links"]>().notNull(),
    status: text("status").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [index("research_sources_company").on(t.companyId)],
);
export const researchReports = pgTable(
  "research_reports",
  {
    id: text("id").primaryKey(),
    companyId: companyId(),
    runId: text("run_id")
      .notNull()
      .references(() => researchRuns.id),
    markdown: text("markdown").notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
    model: text("model").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("research_reports_company").on(t.companyId)],
);
export const researchMessages = pgTable("research_messages", {
  id: text("id").primaryKey(),
  companyId: companyId(),
  runId: text("run_id")
    .notNull()
    .references(() => researchRuns.id),
  question: text("question").notNull(),
  answer: text("answer"),
  webSearch: boolean("web_search").notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
  createdAt: text("created_at").notNull(),
});
export const researchEvents = pgTable(
  "research_events",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => researchRuns.id),
    type: text("type").$type<"progress" | "text" | "done">().notNull(),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("research_events_run").on(t.runId, t.id)],
);

export const companyLinkReviews = pgTable("company_link_reviews", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id),
  runId: text("run_id")
    .notNull()
    .references(() => researchRuns.id),
  links: jsonb("links").$type<VerifiedCompanyLink[]>().notNull(),
  checkedAt: text("checked_at").notNull(),
});
