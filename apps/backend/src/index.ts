import { startExecutor } from "./modules/work/executor";
import { app } from "./app";
import { env } from "./config/env";
import { runMigrations } from "./infrastructure/database/migrate";

runMigrations();
startExecutor();

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.info(`Job Search API listening on http://localhost:${server.port}`);
