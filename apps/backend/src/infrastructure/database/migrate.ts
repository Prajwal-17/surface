import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, pg } from "./client";

export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../drizzle",
    ),
  });
}
if (import.meta.main) {
  try {
    await runMigrations();
    console.info("PostgreSQL migrations applied.");
  } finally {
    await pg.end();
  }
}
