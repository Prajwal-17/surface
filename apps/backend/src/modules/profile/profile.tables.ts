import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobPreferences = sqliteTable("job_preferences", {
  id: text("id").primaryKey(),
  targetRoles: text("target_roles").notNull(),
  preferredSkills: text("preferred_skills").notNull().default(""),
  locationPreferences: text("location_preferences").notNull().default(""),
  dealBreakers: text("deal_breakers").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});
