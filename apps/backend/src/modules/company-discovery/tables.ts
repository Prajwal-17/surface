import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { companies } from "../workspace/workspace.tables";
import { jobs } from "../jobs/jobs.tables";
import type {
  CompanySearchInput,
  CompanyResultCounts,
  CompanyEvidence,
  ContactMethod,
} from "@surface/contracts";

const companyId = () =>
  text("company_id")
    .notNull()
    .references(() => companies.id);

export const companyDiscoverySearches = sqliteTable(
  "company_discovery_searches",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    source: text("source").$type<"funding" | "yc">().notNull(),
    rule: text("rule", { mode: "json" }).$type<CompanySearchInput>().notNull(),
    revision: integer("revision").notNull().default(1),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    paused: integer("paused", { mode: "boolean" }).notNull().default(false),
    nextRunAt: text("next_run_at"),
    lastRunAt: text("last_run_at"),
    latestRunId: text("latest_run_id"),
    latestCounts: text("latest_counts", {
      mode: "json",
    }).$type<CompanyResultCounts>(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("company_search_due").on(table.paused, table.nextRunAt)],
);

export const companySignals = sqliteTable(
  "company_signals",
  {
    id: text("id").primaryKey(),
    companyId: companyId(),
    identity: text("identity").notNull(),
    kind: text("kind").$type<"funding" | "yc" | "manual">().notNull(),
    provider: text("provider").notNull(),
    providerId: text("provider_id"),
    batch: text("batch"),
    amount: text("amount"),
    currency: text("currency"),
    stage: text("stage"),
    announcementDate: text("announcement_date"),
    publicationDate: text("publication_date"),
    evidence: text("evidence", { mode: "json" })
      .$type<CompanyEvidence[]>()
      .notNull()
      .default([]),
    firstDiscoveredAt: text("first_discovered_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("company_signal_identity").on(table.companyId, table.identity),
    index("company_signal_provider").on(table.provider, table.providerId),
  ],
);

export const companySearchMatches = sqliteTable(
  "company_search_matches",
  {
    id: text("id").primaryKey(),
    searchId: text("search_id")
      .notNull()
      .references(() => companyDiscoverySearches.id),
    companyId: companyId(),
    signalId: text("signal_id")
      .notNull()
      .references(() => companySignals.id),
    firstDiscoveredAt: text("first_discovered_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    revision: integer("revision").notNull(),
  },
  (table) => [
    uniqueIndex("company_search_signal").on(table.searchId, table.signalId),
  ],
);

export const companyContacts = sqliteTable(
  "company_contacts",
  {
    id: text("id").primaryKey(),
    companyId: companyId(),
    identity: text("identity").notNull(),
    name: text("name").notNull().default(""),
    role: text("role").notNull(),
    kind: text("kind")
      .$type<"person" | "hiring_inbox" | "company_inbox">()
      .notNull(),
    methods: text("methods", { mode: "json" })
      .$type<ContactMethod[]>()
      .notNull()
      .default([]),
    evidence: text("evidence", { mode: "json" })
      .$type<CompanyEvidence[]>()
      .notNull()
      .default([]),
    manual: integer("manual", { mode: "boolean" }).notNull().default(false),
    checkedAt: text("checked_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("company_contact_identity").on(table.companyId, table.identity),
  ],
);

export const companyActions = sqliteTable("company_actions", {
  id: text("id").primaryKey(),
  companyId: companyId(),
  kind: text("kind")
    .$type<
      | "will_apply"
      | "applied"
      | "contacted"
      | "skipped"
      | "reopened"
      | "deferred"
    >()
    .notNull(),
  contactId: text("contact_id").references(() => companyContacts.id),
  jobId: text("job_id").references(() => jobs.id),
  note: text("note").notNull().default(""),
  deferredUntil: text("deferred_until"),
  requestId: text("request_id").notNull().unique(),
  createdAt: text("created_at").notNull(),
});
