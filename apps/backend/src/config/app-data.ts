import { homedir } from "node:os";
import { join } from "node:path";

export type AppEnvironment = "development" | "production" | "test";

function appName(appEnvironment: AppEnvironment) {
  switch (appEnvironment) {
    case "production":
      return "Surface";
    case "test":
      return "Surface Test";
    default:
      return "Surface Dev";
  }
}

/**
 * Per-platform Electron userData directory. Keep this in sync with
 * `apps/desktop/src/paths.ts` so the standalone backend and desktop app share
 * one database.
 */
export function appDataDirectory(appEnvironment: AppEnvironment) {
  const name = appName(appEnvironment);
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", name);
    case "win32":
      return join(
        process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
        name,
      );
    default:
      return join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        name,
      );
  }
}
