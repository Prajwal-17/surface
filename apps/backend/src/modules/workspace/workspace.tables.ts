import type { CompanyTrackingStatus } from "@surface/contracts";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    website: text("website").notNull().default(""),
    notes: text("notes").notNull().default(""),
    watchReason: text("watch_reason").notNull().default(""),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    trackingStatus: text("tracking_status")
      .$type<CompanyTrackingStatus>()
      .notNull()
      .default("watching"),
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
    enrichmentEvidence: text("enrichment_evidence", { mode: "json" })
      .$type<import("@surface/contracts").CompanyEvidence[]>()
      .notNull()
      .default([]),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("companies_website_identity").on(table.normalizedWebsite),
    index("companies_normalized_name_idx").on(sql`lower(trim(${table.name}))`),
  ],
);

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
    .$type<import("@surface/contracts").SourceInspection["provider"]>()
    .notNull(),
  boardIdentity: text("board_identity"),
  support: text("support")
    .$type<import("@surface/contracts").SourceInspection["support"]>()
    .notNull(),
  reason: text("reason").notNull(),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
