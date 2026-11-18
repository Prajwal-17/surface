import { companyDiscoveryRoutes } from "./modules/company-discovery/routes";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/env";
import { executeStatement, rawQuery } from "./infrastructure/database/client";
import { discoveryRoutes } from "./modules/discovery";
import { applicationRoutes } from "./modules/applications/applications.routes";
import { jobsRoutes } from "./modules/jobs";
import { outreachRoutes } from "./modules/outreach/outreach.routes";
import { profileRoutes } from "./modules/profile";
import { handleError } from "./shared/http/error-handler";
import { requestLogger } from "./shared/http/request-logger";

import { eventsRoutes } from "./modules/work/events.routes";
import { analysisRoutes } from "./modules/analysis/analysis.routes";
import { workRoutes } from "./modules/work/work.routes";
import { collectionRoutes } from "./modules/collection/collection.routes";
import { workspaceRoutes } from "./modules/workspace/workspace.routes";

import { researchRoutes } from "./modules/research/research.routes";
import { authRoutes } from "./modules/auth";
import { readSession } from "./modules/auth/session";
import { desktopRoutes } from "./modules/desktop/routes";

export const app = new Hono();

app.use("*", async (context, next) => {
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "no-referrer");
  context.header("X-Frame-Options", "DENY");
  if (env.WEB_DIST_DIR) {
    context.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
  }
  await next();
});
app.use("*", requestLogger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:17000", "http://127.0.0.1:17000"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

const publicApiPaths = new Set([
  "/api/health",
  "/api/auth/session",
  "/api/auth/login",
  "/api/auth/logout",
]);

app.use("/api/*", async (context, next) => {
  if (
    context.req.method === "OPTIONS" ||
    publicApiPaths.has(context.req.path)
  ) {
    return next();
  }

  const session = await readSession(context);
  if (!session) {
    return context.json({ error: "Sign in to access this workspace." }, 401);
  }

  return next();
});

app.get("/api/health", async (context) => {
  await rawQuery`select 1`;
  return context.json({
    status: "ok",
    database: "sqlite",
    timestamp: new Date().toISOString(),
  });
});

app.route("/api/auth", authRoutes);

app.get("/api/schema", async (context) =>
  context.json({ tables: await sqliteSchema() }),
);

async function sqliteSchema() {
  const tables = await executeStatement<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       AND name <> '__surface_sqlite_migrations'
     ORDER BY name`,
  );
  return Promise.all(
    tables.map(async ({ name }) => ({
      name,
      columns: await executeStatement(
        `PRAGMA table_info(${quoteIdentifier(name)})`,
      ),
      foreignKeys: await executeStatement(
        `PRAGMA foreign_key_list(${quoteIdentifier(name)})`,
      ),
    })),
  );
}

function quoteIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name.replaceAll('"', '""')}"`;
}

app.route("/api/desktop", desktopRoutes);
app.route("/api", researchRoutes);
app.route("/api/company-discovery", companyDiscoveryRoutes);
app.route("/api/discovery", discoveryRoutes);
app.route("/api/jobs", jobsRoutes);
app.route("/api", applicationRoutes);
app.route("/api", outreachRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api", workspaceRoutes);
app.route("/api", collectionRoutes);
app.route("/api", workRoutes);
app.route("/api/analysis", analysisRoutes);
app.route("/api", eventsRoutes);

if (env.WEB_DIST_DIR && existsSync(resolve(env.WEB_DIST_DIR, "index.html"))) {
  const root = resolve(env.WEB_DIST_DIR);
  const staticFiles = serveStatic({
    root,
    onFound: (path, context) => {
      if (path.includes("/assets/")) {
        context.header("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        context.header("Cache-Control", "no-cache");
      }
    },
  });
  const index = serveStatic({ root, path: "index.html" });
  app.use("*", staticFiles);
  app.get("*", async (context, next) => {
    if (
      context.req.path.startsWith("/api/") ||
      extname(context.req.path) !== ""
    ) {
      return next();
    }
    return index(context, next);
  });
}

app.notFound((context) =>
  context.json({ error: "The requested endpoint does not exist." }, 404),
);
app.onError(handleError);
