import { Hono } from "hono";
import { cors } from "hono/cors";
import { pg } from "./infrastructure/database/client";
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

import { researchRoutes } from "./modules/research/research.routes";
import { authRoutes } from "./modules/auth";
import { readSession } from "./modules/auth/session";

export const app = new Hono();

app.use("*", requestLogger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:17000", "http://127.0.0.1:17000"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
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
  await pg`select 1`;
  return context.json({
    status: "ok",
    database: "connected",
    timestamp: new Date().toISOString(),
  });
});

app.route("/api/auth", authRoutes);

app.get("/api/schema", async (context) => {
  const tables = await pg<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  return context.json({
    tables: await Promise.all(
      tables.map(async ({ name }) => {
        const columns = await pg`
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
        const foreignKeys = await pg`
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

app.route("/api", researchRoutes);
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
