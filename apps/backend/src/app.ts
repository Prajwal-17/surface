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
