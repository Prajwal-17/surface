import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/env";
import { rawQuery } from "./infrastructure/database/client";
import { profileRoutes } from "./modules/profile";
import { handleError } from "./shared/http/error-handler";
import { requestLogger } from "./shared/http/request-logger";

import { authRoutes } from "./modules/auth";
import { readSession } from "./modules/auth/session";
import { trackerRoutes } from "./modules/tracker/routes";
import { desktopRoutes } from "./modules/desktop/routes";
import { writingRoutes } from "./modules/writing";

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
app.route("/api/profile", profileRoutes);
app.route("/api/tracker", trackerRoutes);
app.route("/api/desktop", desktopRoutes);
app.route("/api/writing", writingRoutes);

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
