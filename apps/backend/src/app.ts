import { Hono } from "hono";
import { cors } from "hono/cors";
import { sqlite } from "./infrastructure/database/client";
import { discoveryRoutes } from "./modules/discovery";
import { jobsRoutes } from "./modules/jobs";
import { handleError } from "./shared/http/error-handler";
import { requestLogger } from "./shared/http/request-logger";

export const app = new Hono();

app.use("*", requestLogger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
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

app.notFound((context) =>
  context.json({ error: "The requested endpoint does not exist." }, 404),
);
app.onError(handleError);
