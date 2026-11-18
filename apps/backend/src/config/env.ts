import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SUPPORTED_AI_PROVIDERS } from "../shared/ai/constants";

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
  AUTH_SECRET: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().min(32).optional(),
  ),
  AUTH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
  SQLITE_DATABASE_FILE: z.string().min(1).optional(),
  DATA_DIR: z.string().optional(),
  WEB_DIST_DIR: z.string().optional(),
  /** Set by the Electron launcher; protects local APIs for the desktop session. */
  SURFACE_DESKTOP_TOKEN: z.string().min(32).optional(),
  AI_PROVIDER: z.enum(SUPPORTED_AI_PROVIDERS).default("opencode-go"),
  AI_BASE_URL: z
    .string()
    .url()
    .default("https://opencode.ai/inference/go/openai/v1"),
  AI_MODEL: z.string().trim().min(1).default("deepseek-v4.1-flash"),
  AI_REASONING: z.enum(["default", "low", "medium", "high"]).default("default"),
  OPENCODE_GO_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
});

const parsedEnvironment = envSchema.parse(process.env);
const appEnvironment = parsedEnvironment.APP_ENV;
const dataDirectory =
  parsedEnvironment.DATA_DIR ??
  resolve(
    workspaceDirectory,
    "data",
    ...(appEnvironment === "production" ? [] : [appEnvironment]),
  );

export const env = {
  ...parsedEnvironment,
  SQLITE_DATABASE_FILE:
    parsedEnvironment.SQLITE_DATABASE_FILE?.trim() ||
    resolve(dataDirectory, "surface.sqlite3"),
  DATA_DIR: dataDirectory,
};
