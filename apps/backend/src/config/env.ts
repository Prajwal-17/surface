import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = resolve(currentDirectory, "../../../..");
const defaultAppEnvironment =
  process.env.APP_ENV === "production" || process.env.NODE_ENV === "production"
    ? "production"
    : process.env.NODE_ENV === "test"
      ? "test"
      : "development";

const envSchema = z.object({
  APP_ENV: z
    .enum(["development", "production", "test"])
    .default(defaultAppEnvironment),
  AUTH_EMAIL: z.preprocess(
    (value) =>
      typeof value === "string"
        ? value.trim().toLowerCase() || undefined
        : value,
    z.email().max(254).optional(),
  ),
  AUTH_SECRET: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().min(32).optional(),
  ),
  AUTH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SEARXNG_BASE_URL: z.string().url().default("http://127.0.0.1:8080"),
  CRAWLER_BASE_URL: z.string().url().default("http://127.0.0.1:4100"),
  RESEARCH_MAX_ROUNDS: z.coerce.number().int().min(2).default(30),
  RESEARCH_MAX_PAGES: z.coerce.number().int().positive().default(60),
  RESEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).default(900000),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().url().optional(),
  PRODUCTION_DATABASE_URL: z.string().url().optional(),
  DEVELOPMENT_DATABASE_URL: z.string().url().optional(),
  TEST_DATABASE_URL: z.string().url().optional(),
  /** When set, Surface stores data in a real SQLite database at this file. */
  SQLITE_DATABASE_FILE: z.string().min(1).optional(),
  DATA_DIR: z.string().optional(),
  WEB_DIST_DIR: z.string().optional(),
  MIGRATIONS_DIR: z.string().optional(),
  /** Folder containing the generated SQLite migrations. */
  SQLITE_MIGRATIONS_DIR: z.string().optional(),
  /** Set by the Electron launcher; protects local APIs for the desktop session. */
  SURFACE_DESKTOP_TOKEN: z.string().min(32).optional(),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(12_000),
  OMNIROUTE_BASE_URL: z.string().url().default("http://127.0.0.1:20128/v1"),
  OMNIROUTE_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  OMNIROUTE_MODEL: z.string().trim().min(1).default("auto"),
});

const parsedEnvironment = envSchema.parse(process.env);
const appEnvironment = parsedEnvironment.APP_ENV;
const sqliteDatabaseFile = parsedEnvironment.SQLITE_DATABASE_FILE?.trim();
const databaseDialect = sqliteDatabaseFile ? "sqlite" : "postgres";
const databaseUrl =
  parsedEnvironment.DATABASE_URL ??
  (appEnvironment === "production"
    ? parsedEnvironment.PRODUCTION_DATABASE_URL
    : appEnvironment === "test"
      ? parsedEnvironment.TEST_DATABASE_URL
      : parsedEnvironment.DEVELOPMENT_DATABASE_URL);
if (databaseDialect === "postgres" && !databaseUrl) {
  throw new Error(
    `Configure ${appEnvironment === "production" ? "PRODUCTION_DATABASE_URL" : appEnvironment === "test" ? "TEST_DATABASE_URL" : "DEVELOPMENT_DATABASE_URL"}, DATABASE_URL, or SQLITE_DATABASE_FILE for Surface storage.`,
  );
}
if (databaseDialect === "sqlite" && process.env.PGLITE_DATA_DIR) {
  console.warn(
    "PGLITE_DATA_DIR is set but ignored; Surface now uses SQLITE_DATABASE_FILE. No existing PGlite data is read or migrated.",
  );
}
if (databaseDialect === "postgres" && databaseUrl) {
  const database = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(database.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (
    appEnvironment !== "production" &&
    decodeURIComponent(database.pathname.slice(1)) === "surface-data"
  ) {
    throw new Error(
      "Development and tests must never connect to the production surface-data database.",
    );
  }
}
export const env = {
  ...parsedEnvironment,
  DATABASE_URL: databaseUrl,
  DATABASE_DIALECT: databaseDialect,
  SQLITE_DATABASE_FILE: sqliteDatabaseFile,
  DATA_DIR:
    parsedEnvironment.DATA_DIR ??
    resolve(
      workspaceDirectory,
      "data",
      ...(appEnvironment === "production" ? [] : [appEnvironment]),
    ),
};
