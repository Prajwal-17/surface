import {
  closeDatabase,
  executeStatement,
  sqliteHandle,
} from "../src/infrastructure/database/client";
import { runMigrations } from "../src/infrastructure/database/migrate";

if (process.env.CONFIRM_TRACKER_RESET !== "1") {
  throw new Error(
    "Set CONFIRM_TRACKER_RESET=1 to clear tracker companies and applications.",
  );
}
await runMigrations();
sqliteHandle().exec("BEGIN IMMEDIATE");
try {
  await executeStatement("DELETE FROM tracker_applications");
  await executeStatement("DELETE FROM tracker_companies");
  sqliteHandle().exec("COMMIT");
} catch (error) {
  sqliteHandle().exec("ROLLBACK");
  throw error;
} finally {
  await closeDatabase();
}
console.info(
  "Tracker data cleared. Other database tables and external data were left untouched.",
);
