import { jsonb, integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
} from "drizzle-orm/sqlite-core";
import { env } from "../../config/env";

const pgJobPreferences = pgTable("job_preferences", {
  id: text("id").primaryKey(),
  targetRoles: text("target_roles").notNull(),
  preferredSkills: text("preferred_skills").notNull().default(""),
  locationPreferences: text("location_preferences").notNull().default(""),
  dealBreakers: text("deal_breakers").notNull().default(""),
  context:
    jsonb("context").$type<import("@surface/contracts").PersonalContext>(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

const sqliteJobPreferences = sqliteTable("job_preferences", {
  id: sqliteText("id").primaryKey(),
  targetRoles: sqliteText("target_roles").notNull(),
  preferredSkills: sqliteText("preferred_skills").notNull().default(""),
  locationPreferences: sqliteText("location_preferences").notNull().default(""),
  dealBreakers: sqliteText("deal_breakers").notNull().default(""),
  context: sqliteText("context", { mode: "json" }).$type<
    import("@surface/contracts").PersonalContext
  >(),
  revision: sqliteInteger("revision").notNull().default(1),
  updatedAt: sqliteText("updated_at").notNull(),
});

const pgProfileRevisions = pgTable("profile_revisions", {
  revision: integer("revision").primaryKey(),
  content: jsonb("content")
    .$type<import("@surface/contracts").ProfileInput>()
    .notNull(),
  createdAt: text("created_at").notNull(),
});

const sqliteProfileRevisions = sqliteTable("profile_revisions", {
  revision: sqliteInteger("revision").primaryKey(),
  content: sqliteText("content", { mode: "json" })
    .$type<import("@surface/contracts").ProfileInput>()
    .notNull(),
  createdAt: sqliteText("created_at").notNull(),
});

export { sqliteJobPreferences, sqliteProfileRevisions };

export const jobPreferences =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteJobPreferences as unknown as typeof pgJobPreferences)
    : pgJobPreferences;

export const profileRevisions =
  env.DATABASE_DIALECT === "sqlite"
    ? (sqliteProfileRevisions as unknown as typeof pgProfileRevisions)
    : pgProfileRevisions;
