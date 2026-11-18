import { defineConfig } from "drizzle-kit";
import { env } from "./src/config/env";
import { desktopProfilePaths } from "./src/config/desktop-profile";

const profile = desktopProfilePaths(env.APP_ENV);

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infrastructure/database/schema.ts",
  out: "./drizzle-sqlite",
  dbCredentials: {
    url: profile.database,
  },
  strict: true,
  verbose: true,
});
