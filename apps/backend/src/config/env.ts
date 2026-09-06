import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { z } from "zod";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = resolve(
  currentDirectory,
  "../../../../data/job-search.sqlite",
);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DB_FILE_NAME: z.string().default(defaultDatabasePath),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(12_000),
});

export const env = envSchema.parse(process.env);
