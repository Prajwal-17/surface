import { recoverResearch } from "./modules/research/research.service";
import { startExecutor } from "./modules/work/executor";
import { app } from "./app";
import { env } from "./config/env";
import { runMigrations } from "./infrastructure/database/migrate";

runMigrations();
recoverResearch();
startExecutor();

const server = Bun.serve({
  port: env.PORT,
  idleTimeout: 150,
  fetch: app.fetch,
});

console.info(`Job Search API listening on http://localhost:${server.port}`);
