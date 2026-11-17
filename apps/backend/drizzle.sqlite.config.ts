import { defineConfig } from "drizzle-kit";

/**
 * SQLite has a separate, from-scratch migration baseline for the desktop app.
 * The PostgreSQL history in ./drizzle is never applied to SQLite and is not
 * reused here.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infrastructure/database/schema.sqlite.ts",
  out: "./drizzle-sqlite",
  strict: true,
  verbose: true,
});
