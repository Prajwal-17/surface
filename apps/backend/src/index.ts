import { app } from "./app";
import { env } from "./config/env";
import { runMigrations } from "./infrastructure/database/migrate";

runMigrations();

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.info(`Job Search API listening on http://localhost:${server.port}`);
