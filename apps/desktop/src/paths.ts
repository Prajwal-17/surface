import { app } from "electron";
import { join } from "node:path";

export interface DesktopPaths {
  root: string;
  data: string;
  database: string;
  logs: string;
  web: string;
  backendEntry: string;
}

export function desktopPaths(): DesktopPaths {
  const userData = app.getPath("userData");
  const resources = app.isPackaged
    ? process.resourcesPath
    : join(app.getAppPath(), "build");
  return {
    root: userData,
    data: join(userData, "data"),
    database: join(userData, "surface.sqlite3"),
    logs: join(userData, "logs"),
    web: join(resources, "web"),
    backendEntry: join(resources, "backend", "index.mjs"),
  };
}
