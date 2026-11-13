import { app } from "electron";
import { join } from "node:path";

export interface DesktopPaths {
  root: string;
  data: string;
  database: string;
  legacyDatabase: string;
  logs: string;
  settings: string;
  web: string;
  backendEntry: string;
  backendMigrations: string;
  crawlerEntry: string;
  crawlerRoot: string;
  playwrightBrowsers: string;
}

export function desktopPaths(): DesktopPaths {
  const userData = app.getPath("userData");
  const resources = app.isPackaged
    ? process.resourcesPath
    : join(app.getAppPath(), "build");
  return {
    root: userData,
    data: join(userData, "data"),
    // A new, distinct SQLite file. Any previous pglite/ directory is never
    // opened, migrated, overwritten, or deleted.
    database: join(userData, "surface.sqlite3"),
    legacyDatabase: join(userData, "pglite"),
    logs: join(userData, "logs"),
    settings: join(userData, "settings.json"),
    web: join(resources, "web"),
    backendEntry: join(resources, "backend", "index.mjs"),
    backendMigrations: join(resources, "backend", "drizzle-sqlite"),
    crawlerEntry: join(resources, "crawler", "dist", "index.js"),
    crawlerRoot: join(resources, "crawler"),
    playwrightBrowsers: join(resources, "playwright"),
  };
}
