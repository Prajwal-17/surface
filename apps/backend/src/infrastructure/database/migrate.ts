import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { env } from "../../config/env";
import {
  db,
  resolveMigrationsFolder,
  type Database,
} from "./client";

export async function runMigrations(): Promise<string> {
  const migrationsFolder = resolveMigrationsFolder();
  if (env.EMBEDDED_DATABASE) {
    await migratePglite(db, { migrationsFolder });
  } else {
    await migratePostgres(db as never, { migrationsFolder });
  }
  return migrationsFolder;
}

export type { Database };
