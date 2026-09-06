import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, sqlite } from "./client";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(currentDirectory, "../../drizzle");

export function runMigrations(): void {
  migrate(db, { migrationsFolder });
}

if (import.meta.main) {
  runMigrations();
  console.info("Database migrations applied.");
  sqlite.close();
}
