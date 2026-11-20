import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig } from "drizzle-kit";
import { appDataDirectory, type AppEnvironment } from "./src/config/app-data";

const appEnvironment: AppEnvironment =
  process.env.APP_ENV === "production" || process.env.NODE_ENV === "production"
    ? "production"
    : process.env.NODE_ENV === "test"
      ? "test"
      : "development";

const appDataRoot = appDataDirectory(appEnvironment);
const databaseFile =
  process.env.SQLITE_DATABASE_FILE?.trim() ||
  (process.env.DATA_DIR
    ? join(process.env.DATA_DIR, "surface.sqlite3")
    : join(appDataRoot, "surface.sqlite3"));

// Studio cannot open a SQLite file whose parent directory does not exist yet.
mkdirSync(dirname(databaseFile), { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  dbCredentials: { url: databaseFile },
});
