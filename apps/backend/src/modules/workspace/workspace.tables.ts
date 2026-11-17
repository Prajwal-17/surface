import {
  boolean,
  integer,
  pgTable,
  text,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";

const pgCompanies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    website: text("website").notNull().default(""),
    notes: text("notes").notNull().default(""),
    watchReason: text("watch_reason").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    description: text("description").notNull().default(""),
    normalizedWebsite: text("normalized_website"),
    reviewState: text("review_state")
      .$type<"new" | "will_apply" | "done" | "skipped">()
      .notNull()
      .default("new"),
    deferredUntil: text("deferred_until"),
    logoPath: text("logo_path"),
    logoSourceUrl: text("logo_source_url"),
    logoFetchedAt: text("logo_fetched_at"),
    logoKind: text("logo_kind"),
    enrichedAt: text("enriched_at"),
    detailsCheckedAt: text("details_checked_at"),
    contactsCheckedAt: text("contacts_checked_at"),
    enrichmentError: text("enrichment_error"),
    enrichmentEvidence: jsonb("enrichment_evidence")
      .$type<import("@surface/contracts").CompanyEvidence[]>()
      .notNull()
      .default([]),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("companies_website_identity").on(table.normalizedWebsite)],
);

const sqliteCompanies = sqliteTable(
  "companies",
  {
    id: sqliteText("id").primaryKey(),
    name: sqliteText("name").notNull(),
    website: sqliteText("website").notNull().default(""),
    notes: sqliteText("notes").notNull().default(""),
    watchReason: sqliteText("watch_reason").notNull().default(""),
    archived: sqliteInteger("archived", { mode: "boolean" })
      .notNull()
      .default(false),
    description: sqliteText("description").notNull().default(""),
    normalizedWebsite: sqliteText("normalized_website"),
    reviewState: sqliteText("review_state")
      .$type<"new" | "will_apply" | "done" | "skipped">()
      .notNull()
      .default("new"),
    deferredUntil: sqliteText("deferred_until"),
    logoPath: sqliteText("logo_path"),
    logoSourceUrl: sqliteText("logo_source_url"),
    logoFetchedAt: sqliteText("logo_fetched_at"),
    logoKind: sqliteText("logo_kind"),
    enrichedAt: sqliteText("enriched_at"),
    detailsCheckedAt: sqliteText("details_checked_at"),
    contactsCheckedAt: sqliteText("contacts_checked_at"),
    enrichmentError: sqliteText("enrichment_error"),
    enrichmentEvidence: sqliteText("enrichment_evidence", { mode: "json" })
      .$type<import("@surface/contracts").CompanyEvidence[]>()
      .notNull()
      .default([]),
    createdAt: sqliteText("created_at").notNull(),
    updatedAt: sqliteText("updated_at").notNull(),
  },
  (table) => [
    sqliteIndex("companies_website_identity").on(table.normalizedWebsite),
  ],
);

const pgConfiguredSources = pgTable("configured_sources", {
  scheduleHours: integer("schedule_hours").notNull().default(12),
  nextDueAt: text("next_due_at"),
  lastSuccessAt: text("last_success_at"),
  retryAt: text("retry_at"),
  failureCount: integer("failure_count").notNull().default(0),
  id: text("id").primaryKey(),
  companyId: text("company_id").references(() => pgCompanies.id),
  label: text("label").notNull(),
  url: text("url").notNull().unique(),
  endpoint: text("endpoint").notNull(),
  provider: text("provider")
    .$type<import("@surface/contracts").SourceInspection["provider"]>()
    .notNull(),
  boardIdentity: text("board_identity"),
  support: text("support")
    .$type<import("@surface/contracts").SourceInspection["support"]>()
    .notNull(),
  reason: text("reason").notNull(),
  paused: boolean("paused").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const sqliteConfiguredSources = sqliteTable("configured_sources", {
  scheduleHours: sqliteInteger("schedule_hours").notNull().default(12),
  nextDueAt: sqliteText("next_due_at"),
  lastSuccessAt: sqliteText("last_success_at"),
  retryAt: sqliteText("retry_at"),
  failureCount: sqliteInteger("failure_count").notNull().default(0),
  id: sqliteText("id").primaryKey(),
  companyId: sqliteText("company_id").references(() => sqliteCompanies.id),
  label: sqliteText("label").notNull(),
  url: sqliteText("url").notNull().unique(),
  endpoint: sqliteText("endpoint").notNull(),
  provider: sqliteText("provider")
    .$type<import("@surface/contracts").SourceInspection["provider"]>()
    .notNull(),
  boardIdentity: sqliteText("board_identity"),
  support: sqliteText("support")
    .$type<import("@surface/contracts").SourceInspection["support"]>()
    .notNull(),
  reason: sqliteText("reason").notNull(),
  paused: sqliteInteger("paused", { mode: "boolean" }).notNull().default(false),
  createdAt: sqliteText("created_at").notNull(),
  updatedAt: sqliteText("updated_at").notNull(),
});

export { sqliteCompanies, sqliteConfiguredSources };

export const companies =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteCompanies as unknown as typeof pgCompanies)
    : pgCompanies;

export const configuredSources =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteConfiguredSources as unknown as typeof pgConfiguredSources)
    : pgConfiguredSources;
