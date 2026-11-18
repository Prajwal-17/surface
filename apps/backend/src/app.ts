import { companyDiscoveryRoutes } from "./modules/company-discovery/routes";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/env";
import {
  databaseDialect,
  executeStatement,
  rawQuery,
} from "./infrastructure/database/client";
import { discoveryRoutes } from "./modules/discovery";
import { applicationRoutes } from "./modules/applications/applications.routes";
import { jobsRoutes } from "./modules/jobs";
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
    database: databaseDialect(),
    timestamp: new Date().toISOString(),
  });
});

app.route("/api/auth", authRoutes);

app.get("/api/schema", async (context) => {
  if (databaseDialect() === "sqlite") {
    return context.json({ tables: await sqliteSchema() });
  }
  const tables = await rawQuery<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  return context.json({
    tables: await Promise.all(
      tables.map(async ({ name }) => {
        const columns = await rawQuery`
        SELECT c.ordinal_position - 1 AS cid, c.column_name AS name,
          c.data_type AS type, CASE WHEN c.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
          c.column_default AS dflt_value,
          COALESCE((SELECT k.ordinal_position FROM information_schema.table_constraints t
            JOIN information_schema.key_column_usage k USING (constraint_catalog, constraint_schema, constraint_name)
            WHERE t.constraint_type = 'PRIMARY KEY' AND t.table_schema = c.table_schema
              AND t.table_name = c.table_name AND k.column_name = c.column_name), 0) AS pk
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = ${name}
        ORDER BY c.ordinal_position`;
        const foreignKeys = await rawQuery`
        SELECT con.oid::integer AS id, k.ordinality::integer - 1 AS seq,
          target.relname AS "table", a.attname AS "from", af.attname AS "to",
          CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' ELSE 'SET DEFAULT' END AS on_update,
          CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' ELSE 'SET DEFAULT' END AS on_delete
        FROM pg_constraint con
        JOIN pg_class source ON source.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = source.relnamespace
        JOIN pg_class target ON target.oid = con.confrelid
        CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(local_key, foreign_key, ordinality)
        JOIN pg_attribute a ON a.attrelid = source.oid AND a.attnum = k.local_key
        JOIN pg_attribute af ON af.attrelid = target.oid AND af.attnum = k.foreign_key
        WHERE con.contype = 'f' AND ns.nspname = 'public' AND source.relname = ${name}
        ORDER BY con.oid, k.ordinality`;
        return { name, columns, foreignKeys };
      }),
    ),
  });
});

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
