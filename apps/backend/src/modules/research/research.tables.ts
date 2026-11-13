import {
  serial,
  boolean,
  jsonb,
  pgTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
  uniqueIndex as sqliteUniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { env } from "../../config/env";
import { companies, sqliteCompanies } from "../workspace/workspace.tables";
import type { VerifiedCompanyLink, ResearchSource } from "@surface/contracts";

const companyId = () =>
  text("company_id")
    .notNull()
    .references(() => companies.id);
const sqliteCompanyId = () =>
  sqliteText("company_id")
    .notNull()
    .references(() => sqliteCompanies.id);

export const pgResearchRuns = pgTable(
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

const sqliteResearchRuns = sqliteTable(
  "research_runs",
  {
    id: sqliteText("id").primaryKey(),
    companyId: sqliteCompanyId(),
    kind: sqliteText("kind")
      .$type<"report" | "question" | "links" | "summary">()
      .notNull(),
    state: sqliteText("state")
      .$type<
        | "running"
        | "completed"
        | "partial"
        | "failed"
        | "cancelled"
        | "interrupted"
      >()
      .notNull(),
    draft: sqliteText("draft").notNull().default(""),
    error: sqliteText("error"),
    createdAt: sqliteText("created_at").notNull(),
    completedAt: sqliteText("completed_at"),
  },
  (table) => [
    sqliteUniqueIndex("research_active_company")
      .on(table.companyId)
      .where(sql`${table.state} = 'running'`),
  ],
);

const pgResearchSources = pgTable(
  "research_sources",
  {
    id: text("id").primaryKey(),
    companyId: companyId(),
    runId: text("run_id")
      .notNull()
      .references(() => pgResearchRuns.id),
    url: text("url").notNull(),
    title: text("title").notNull(),
    kind: text("kind").$type<"search" | "page">().notNull(),
    text: text("text").notNull(),
    links: jsonb("links").$type<ResearchSource["links"]>().notNull(),
    status: text("status").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (table) => [index("research_sources_company").on(table.companyId)],
);

const sqliteResearchSources = sqliteTable(
  "research_sources",
  {
    id: sqliteText("id").primaryKey(),
    companyId: sqliteCompanyId(),
    runId: sqliteText("run_id")
      .notNull()
      .references(() => sqliteResearchRuns.id),
    url: sqliteText("url").notNull(),
    title: sqliteText("title").notNull(),
    kind: sqliteText("kind").$type<"search" | "page">().notNull(),
    text: sqliteText("text").notNull(),
    links: sqliteText("links", { mode: "json" })
      .$type<ResearchSource["links"]>()
      .notNull(),
    status: sqliteText("status").notNull(),
    retrievedAt: sqliteText("retrieved_at").notNull(),
  },
  (table) => [sqliteIndex("research_sources_company").on(table.companyId)],
);

const pgResearchReports = pgTable(
  "research_reports",
  {
    id: text("id").primaryKey(),
    companyId: companyId(),
    runId: text("run_id")
      .notNull()
      .references(() => pgResearchRuns.id),
    markdown: text("markdown").notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
    model: text("model").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("research_reports_company").on(table.companyId)],
);

const sqliteResearchReports = sqliteTable(
  "research_reports",
  {
    id: sqliteText("id").primaryKey(),
    companyId: sqliteCompanyId(),
    runId: sqliteText("run_id")
      .notNull()
      .references(() => sqliteResearchRuns.id),
    markdown: sqliteText("markdown").notNull(),
    sourceIds: sqliteText("source_ids", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    model: sqliteText("model").notNull(),
    createdAt: sqliteText("created_at").notNull(),
  },
  (table) => [sqliteIndex("research_reports_company").on(table.companyId)],
);

const pgResearchMessages = pgTable("research_messages", {
  id: text("id").primaryKey(),
  companyId: companyId(),
  runId: text("run_id")
    .notNull()
    .references(() => pgResearchRuns.id),
  question: text("question").notNull(),
  answer: text("answer"),
  webSearch: boolean("web_search").notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
  createdAt: text("created_at").notNull(),
});

const sqliteResearchMessages = sqliteTable("research_messages", {
  id: sqliteText("id").primaryKey(),
  companyId: sqliteCompanyId(),
  runId: sqliteText("run_id")
    .notNull()
    .references(() => sqliteResearchRuns.id),
  question: sqliteText("question").notNull(),
  answer: sqliteText("answer"),
  webSearch: sqliteInteger("web_search", { mode: "boolean" }).notNull(),
  sourceIds: sqliteText("source_ids", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  createdAt: sqliteText("created_at").notNull(),
});

const pgResearchEvents = pgTable(
  "research_events",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => pgResearchRuns.id),
    type: text("type").$type<"progress" | "text" | "done">().notNull(),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("research_events_run").on(table.runId, table.id)],
);

const sqliteResearchEvents = sqliteTable(
  "research_events",
  {
    id: sqliteInteger("id").primaryKey({ autoIncrement: true }),
    runId: sqliteText("run_id")
      .notNull()
      .references(() => sqliteResearchRuns.id),
    type: sqliteText("type").$type<"progress" | "text" | "done">().notNull(),
    text: sqliteText("text").notNull(),
    createdAt: sqliteText("created_at").notNull(),
  },
  (table) => [sqliteIndex("research_events_run").on(table.runId, table.id)],
);

const pgCompanyLinkReviews = pgTable("company_link_reviews", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id),
  runId: text("run_id")
    .notNull()
    .references(() => pgResearchRuns.id),
  links: jsonb("links").$type<VerifiedCompanyLink[]>().notNull(),
  checkedAt: text("checked_at").notNull(),
});

const sqliteCompanyLinkReviews = sqliteTable("company_link_reviews", {
  companyId: sqliteText("company_id")
    .primaryKey()
    .references(() => sqliteCompanies.id),
  runId: sqliteText("run_id")
    .notNull()
    .references(() => sqliteResearchRuns.id),
  links: sqliteText("links", { mode: "json" })
    .$type<VerifiedCompanyLink[]>()
    .notNull(),
  checkedAt: sqliteText("checked_at").notNull(),
});

export {
  sqliteResearchRuns,
  sqliteResearchSources,
  sqliteResearchReports,
  sqliteResearchMessages,
  sqliteResearchEvents,
  sqliteCompanyLinkReviews,
};

export const researchRuns =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteResearchRuns as unknown as typeof pgResearchRuns)
    : pgResearchRuns;

export const researchSources =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteResearchSources as unknown as typeof pgResearchSources)
    : pgResearchSources;

export const researchReports =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteResearchReports as unknown as typeof pgResearchReports)
    : pgResearchReports;

export const researchMessages =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteResearchMessages as unknown as typeof pgResearchMessages)
    : pgResearchMessages;

export const researchEvents =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteResearchEvents as unknown as typeof pgResearchEvents)
    : pgResearchEvents;

export const companyLinkReviews =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteCompanyLinkReviews as unknown as typeof pgCompanyLinkReviews)
    : pgCompanyLinkReviews;
