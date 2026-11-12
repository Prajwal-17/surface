import { closeDatabase } from "../src/infrastructure/database/client";
import { runMigrations } from "../src/infrastructure/database/migrate";

try {
  const folder = await runMigrations();
  console.info(`Surface database migrations applied from ${folder}.`);
} finally {
  await closeDatabase();
}
