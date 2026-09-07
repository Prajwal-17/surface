import { Hono } from "hono";
import { cors } from "hono/cors";
import { sqlite } from "./infrastructure/database/client";
import { discoveryRoutes } from "./modules/discovery";
import { jobsRoutes } from "./modules/jobs";
import { profileRoutes } from "./modules/profile";
import { handleError } from "./shared/http/error-handler";
import { requestLogger } from "./shared/http/request-logger";

import { eventsRoutes } from "./modules/work/events.routes";
import { analysisRoutes } from "./modules/analysis/analysis.routes";
import { workRoutes } from "./modules/work/work.routes";
import { collectionRoutes } from "./modules/collection/collection.routes";
import { workspaceRoutes } from "./modules/workspace/workspace.routes";

export const app = new Hono();

app.use("*", requestLogger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
  }),
);

app.get("/api/health", (context) => {
  sqlite.query("select 1").get();
  return context.json({
    status: "ok",
    database: "connected",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/schema", (context) => {
  const tableNames = sqlite
    .query(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name",
    )
    .all() as { name: string }[];

  return context.json({
    tables: tableNames.map(({ name }) => {
      const identifier = name.replaceAll('"', '""');
      const columns = sqlite
        .query(`PRAGMA table_info("${identifier}")`)
        .all() as {
        cid: number;
        name: string;
        type: string;
        notnull: 0 | 1;
        dflt_value: string | number | null;
        pk: number;
      }[];
      const foreignKeys = sqlite
        .query(`PRAGMA foreign_key_list("${identifier}")`)
        .all() as {
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
      }[];

      return { name, columns, foreignKeys };
    }),
  });
});

app.route("/api/discovery", discoveryRoutes);
app.route("/api/jobs", jobsRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api", workspaceRoutes);
app.route("/api", collectionRoutes);
app.route("/api", workRoutes);
app.route("/api/analysis", analysisRoutes);
app.route("/api", eventsRoutes);

app.notFound((context) =>
  context.json({ error: "The requested endpoint does not exist." }, 404),
);
app.onError(handleError);
