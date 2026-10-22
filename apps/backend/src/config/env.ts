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
  DB_FILE_NAME: z.string().optional(),
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
const databaseDirectory =
  parsedEnvironment.APP_ENV === "production" ? [] : [parsedEnvironment.APP_ENV];

export const env = {
  ...parsedEnvironment,
  DB_FILE_NAME:
    parsedEnvironment.DB_FILE_NAME ??
    resolve(workspaceDirectory, "data", ...databaseDirectory, "surface.sqlite"),
};
