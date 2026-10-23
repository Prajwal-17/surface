import { jsonb, integer, pgTable, text } from "drizzle-orm/pg-core";

export const jobPreferences = pgTable("job_preferences", {
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

export const profileRevisions = pgTable("profile_revisions", {
  revision: integer("revision").primaryKey(),
  content: jsonb("content")
    .$type<import("@surface/contracts").ProfileInput>()
    .notNull(),
  createdAt: text("created_at").notNull(),
});
