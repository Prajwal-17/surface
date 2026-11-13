import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
  uniqueIndex as sqliteUniqueIndex,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";
import { companies, sqliteCompanies } from "../workspace/workspace.tables";
import { jobs, sqliteJobs } from "../jobs/jobs.tables";
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
const sqliteCompanyId = () =>
  sqliteText("company_id")
    .notNull()
    .references(() => sqliteCompanies.id);

const pgCompanyDiscoverySearches = pgTable(
  "company_discovery_searches",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    source: text("source").$type<"funding" | "yc">().notNull(),
    rule: jsonb("rule").$type<CompanySearchInput>().notNull(),
    revision: integer("revision").notNull().default(1),
    archived: boolean("archived").notNull().default(false),
    paused: boolean("paused").notNull().default(false),
    nextRunAt: text("next_run_at"),
    lastRunAt: text("last_run_at"),
    latestRunId: text("latest_run_id"),
    latestCounts: jsonb("latest_counts").$type<CompanyResultCounts>(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("company_search_due").on(table.paused, table.nextRunAt)],
);

const sqliteCompanyDiscoverySearches = sqliteTable(
  "company_discovery_searches",
  {
    id: sqliteText("id").primaryKey(),
    name: sqliteText("name").notNull(),
    source: sqliteText("source").$type<"funding" | "yc">().notNull(),
    rule: sqliteText("rule", { mode: "json" })
      .$type<CompanySearchInput>()
      .notNull(),
    revision: sqliteInteger("revision").notNull().default(1),
    archived: sqliteInteger("archived", { mode: "boolean" })
      .notNull()
      .default(false),
    paused: sqliteInteger("paused", { mode: "boolean" })
      .notNull()
      .default(false),
    nextRunAt: sqliteText("next_run_at"),
    lastRunAt: sqliteText("last_run_at"),
    latestRunId: sqliteText("latest_run_id"),
    latestCounts: sqliteText("latest_counts", {
      mode: "json",
    }).$type<CompanyResultCounts>(),
    createdAt: sqliteText("created_at").notNull(),
    updatedAt: sqliteText("updated_at").notNull(),
  },
  (table) => [
    sqliteIndex("company_search_due").on(table.paused, table.nextRunAt),
  ],
);

const pgCompanySignals = pgTable(
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
    evidence: jsonb("evidence")
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

const sqliteCompanySignals = sqliteTable(
  "company_signals",
  {
    id: sqliteText("id").primaryKey(),
    companyId: sqliteCompanyId(),
    identity: sqliteText("identity").notNull(),
    kind: sqliteText("kind").$type<"funding" | "yc" | "manual">().notNull(),
    provider: sqliteText("provider").notNull(),
    providerId: sqliteText("provider_id"),
    batch: sqliteText("batch"),
    amount: sqliteText("amount"),
    currency: sqliteText("currency"),
    stage: sqliteText("stage"),
    announcementDate: sqliteText("announcement_date"),
    publicationDate: sqliteText("publication_date"),
    evidence: sqliteText("evidence", { mode: "json" })
      .$type<CompanyEvidence[]>()
      .notNull()
      .default([]),
    firstDiscoveredAt: sqliteText("first_discovered_at").notNull(),
    lastSeenAt: sqliteText("last_seen_at").notNull(),
  },
  (table) => [
    sqliteUniqueIndex("company_signal_identity").on(
      table.companyId,
      table.identity,
    ),
    sqliteIndex("company_signal_provider").on(table.provider, table.providerId),
  ],
);

const pgCompanySearchMatches = pgTable(
  "company_search_matches",
  {
    id: text("id").primaryKey(),
    searchId: text("search_id")
      .notNull()
      .references(() => pgCompanyDiscoverySearches.id),
    companyId: companyId(),
    signalId: text("signal_id")
      .notNull()
      .references(() => pgCompanySignals.id),
    firstDiscoveredAt: text("first_discovered_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    revision: integer("revision").notNull(),
  },
  (table) => [
    uniqueIndex("company_search_signal").on(table.searchId, table.signalId),
  ],
);

const sqliteCompanySearchMatches = sqliteTable(
  "company_search_matches",
  {
    id: sqliteText("id").primaryKey(),
    searchId: sqliteText("search_id")
      .notNull()
      .references(() => sqliteCompanyDiscoverySearches.id),
    companyId: sqliteCompanyId(),
    signalId: sqliteText("signal_id")
      .notNull()
      .references(() => sqliteCompanySignals.id),
    firstDiscoveredAt: sqliteText("first_discovered_at").notNull(),
    lastSeenAt: sqliteText("last_seen_at").notNull(),
    revision: sqliteInteger("revision").notNull(),
  },
  (table) => [
    sqliteUniqueIndex("company_search_signal").on(
      table.searchId,
      table.signalId,
    ),
  ],
);

const pgCompanyContacts = pgTable(
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
    methods: jsonb("methods").$type<ContactMethod[]>().notNull().default([]),
    evidence: jsonb("evidence")
      .$type<CompanyEvidence[]>()
      .notNull()
      .default([]),
    manual: boolean("manual").notNull().default(false),
    checkedAt: text("checked_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("company_contact_identity").on(table.companyId, table.identity),
  ],
);

const sqliteCompanyContacts = sqliteTable(
  "company_contacts",
  {
    id: sqliteText("id").primaryKey(),
    companyId: sqliteCompanyId(),
    identity: sqliteText("identity").notNull(),
    name: sqliteText("name").notNull().default(""),
    role: sqliteText("role").notNull(),
    kind: sqliteText("kind")
      .$type<"person" | "hiring_inbox" | "company_inbox">()
      .notNull(),
    methods: sqliteText("methods", { mode: "json" })
      .$type<ContactMethod[]>()
      .notNull()
      .default([]),
    evidence: sqliteText("evidence", { mode: "json" })
      .$type<CompanyEvidence[]>()
      .notNull()
      .default([]),
    manual: sqliteInteger("manual", { mode: "boolean" })
      .notNull()
      .default(false),
    checkedAt: sqliteText("checked_at").notNull(),
    createdAt: sqliteText("created_at").notNull(),
    updatedAt: sqliteText("updated_at").notNull(),
  },
  (table) => [
    sqliteUniqueIndex("company_contact_identity").on(
      table.companyId,
      table.identity,
    ),
  ],
);

const pgCompanyActions = pgTable("company_actions", {
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
  contactId: text("contact_id").references(() => pgCompanyContacts.id),
  jobId: text("job_id").references(() => jobs.id),
  note: text("note").notNull().default(""),
  deferredUntil: text("deferred_until"),
  requestId: text("request_id").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

const sqliteCompanyActions = sqliteTable("company_actions", {
  id: sqliteText("id").primaryKey(),
  companyId: sqliteCompanyId(),
  kind: sqliteText("kind")
    .$type<
      | "will_apply"
      | "applied"
      | "contacted"
      | "skipped"
      | "reopened"
      | "deferred"
    >()
    .notNull(),
  contactId: sqliteText("contact_id").references(
    () => sqliteCompanyContacts.id,
  ),
  jobId: sqliteText("job_id").references(() => sqliteJobs.id),
  note: sqliteText("note").notNull().default(""),
  deferredUntil: sqliteText("deferred_until"),
  requestId: sqliteText("request_id").notNull().unique(),
  createdAt: sqliteText("created_at").notNull(),
});

export {
  sqliteCompanyDiscoverySearches,
  sqliteCompanySignals,
  sqliteCompanySearchMatches,
  sqliteCompanyContacts,
  sqliteCompanyActions,
};

export const companyDiscoverySearches =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteCompanyDiscoverySearches as unknown as typeof pgCompanyDiscoverySearches)
    : pgCompanyDiscoverySearches;

export const companySignals =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteCompanySignals as unknown as typeof pgCompanySignals)
    : pgCompanySignals;

export const companySearchMatches =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteCompanySearchMatches as unknown as typeof pgCompanySearchMatches)
    : pgCompanySearchMatches;

export const companyContacts =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteCompanyContacts as unknown as typeof pgCompanyContacts)
    : pgCompanyContacts;

export const companyActions =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteCompanyActions as unknown as typeof pgCompanyActions)
    : pgCompanyActions;
