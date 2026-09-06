import { defineConfig } from "drizzle-kit";
import { env } from "./src/config/env";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infrastructure/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: env.DB_FILE_NAME,
  },
  strict: true,
  verbose: true,
});
