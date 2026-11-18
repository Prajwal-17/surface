import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobPreferences = sqliteTable("job_preferences", {
  id: text("id").primaryKey(),
  targetRoles: text("target_roles").notNull(),
  preferredSkills: text("preferred_skills").notNull().default(""),
  locationPreferences: text("location_preferences").notNull().default(""),
  dealBreakers: text("deal_breakers").notNull().default(""),
  context: text("context", { mode: "json" }).$type<
    import("@surface/contracts").PersonalContext
  >(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const profileRevisions = sqliteTable("profile_revisions", {
  revision: integer("revision").primaryKey(),
  content: text("content", { mode: "json" })
    .$type<import("@surface/contracts").ProfileInput>()
    .notNull(),
  createdAt: text("created_at").notNull(),
});
