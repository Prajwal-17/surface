import {
  boolean,
  integer,
  pgTable,
  text,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
export const companies = pgTable(
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
  (t) => [index("companies_website_identity").on(t.normalizedWebsite)],
);
export const configuredSources = pgTable("configured_sources", {
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
  paused: boolean("paused").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
