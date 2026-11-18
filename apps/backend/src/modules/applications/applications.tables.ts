import {
  applicationStatusSchema,
  type ApplicationStatus,
} from "@surface/contracts";
import { sql, type SQLWrapper } from "drizzle-orm";
import { check, index, pgTable, text } from "drizzle-orm/pg-core";
import {
  check as sqliteCheck,
  index as sqliteIndex,
  sqliteTable,
  text as sqliteText,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";
import { jobs, sqliteJobs } from "../jobs/jobs.tables";
import { companies, sqliteCompanies } from "../workspace/workspace.tables";

function validStatus(column: SQLWrapper) {
  const values = applicationStatusSchema.options.map((status) =>
    sql.raw(`'${status}'`),
  );
  return sql`${column} in (${sql.join(values, sql.raw(", "))})`;
}

const pgApplications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .unique()
      .references(() => jobs.id, { onDelete: "set null" }),
    companyId: text("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    companyName: text("company_name").notNull(),
    sourceUrl: text("source_url"),
    status: text("status")
      .$type<ApplicationStatus>()
      .notNull()
      .default("queued"),
    notes: text("notes").notNull().default(""),
    outcome: text("outcome"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    appliedOn: text("applied_on"),
    contactedOn: text("contacted_on"),
    followUpOn: text("follow_up_on"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("applications_status_check", validStatus(table.status)),
    index("applications_company_idx").on(table.companyId),
  ],
);

export const sqliteApplications = sqliteTable(
  "applications",
  {
    id: sqliteText("id").primaryKey(),
    jobId: sqliteText("job_id")
      .unique()
      .references(() => sqliteJobs.id, { onDelete: "set null" }),
    companyId: sqliteText("company_id").references(() => sqliteCompanies.id, {
      onDelete: "set null",
    }),
    title: sqliteText("title").notNull(),
    companyName: sqliteText("company_name").notNull(),
    sourceUrl: sqliteText("source_url"),
    status: sqliteText("status")
      .$type<ApplicationStatus>()
      .notNull()
      .default("queued"),
    notes: sqliteText("notes").notNull().default(""),
    outcome: sqliteText("outcome"),
    contactName: sqliteText("contact_name"),
    contactEmail: sqliteText("contact_email"),
    appliedOn: sqliteText("applied_on"),
    contactedOn: sqliteText("contacted_on"),
    followUpOn: sqliteText("follow_up_on"),
    archivedAt: sqliteText("archived_at"),
    createdAt: sqliteText("created_at").notNull(),
    updatedAt: sqliteText("updated_at").notNull(),
  },
  (table) => [
    sqliteCheck("applications_status_check", validStatus(table.status)),
    sqliteIndex("applications_company_idx").on(table.companyId),
  ],
);

export const applications =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteApplications as unknown as typeof pgApplications)
    : pgApplications;
