import {
  applicationStatusSchema,
  type ApplicationStatus,
  type Compensation,
  type applicationWorkModeSchema,
} from "@surface/contracts";
import { sql, type SQLWrapper } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { jobs } from "../jobs/jobs.tables";
import { companies } from "../workspace/workspace.tables";

function validStatus(column: SQLWrapper) {
  const values = applicationStatusSchema.options.map((status) =>
    sql.raw(`'${status}'`),
  );
  return sql`${column} in (${sql.join(values, sql.raw(", "))})`;
}

export const applications = sqliteTable(
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
    description: text("description"),
    publishedAt: text("published_at"),
    location: text("location"),
    employmentType: text("employment_type"),
    workMode:
      text("work_mode").$type<
        (typeof applicationWorkModeSchema)["options"][number]
      >(),
    compensation: text("compensation", { mode: "json" }).$type<Compensation>(),
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
