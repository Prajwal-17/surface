import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = resolve(
  currentDirectory,
  "../../../../data/job-search.sqlite",
);

const envSchema = z.object({
  SEARXNG_BASE_URL: z.string().url().default("http://127.0.0.1:8080"),
  CRAWLER_BASE_URL: z.string().url().default("http://127.0.0.1:4100"),
  RESEARCH_MAX_ROUNDS: z.coerce.number().int().min(2).default(30),
  RESEARCH_MAX_PAGES: z.coerce.number().int().positive().default(60),
  RESEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).default(900000),
  PORT: z.coerce.number().int().positive().default(4000),
  DB_FILE_NAME: z.string().default(defaultDatabasePath),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(12_000),
  OMNIROUTE_BASE_URL: z.string().url().default("http://127.0.0.1:20128/v1"),
  OMNIROUTE_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  OMNIROUTE_MODEL: z.string().trim().min(1).default("auto"),
});

export const env = envSchema.parse(process.env);
