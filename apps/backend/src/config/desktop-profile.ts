import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Desktop profile locations on Linux. The Electron launcher keeps each channel
 * in its own userData directory (`~/.config/Surface Dev` for development,
 * `~/.config/Surface` for production) and runs the backend against that file.
 * Local tooling such as Drizzle Studio and the dev data reset uses the same
 * locations so it never opens a database the app does not use.
 */
export interface DesktopProfilePaths {
  root: string;
  database: string;
  data: string;
}

export function desktopProfilePaths(
  appEnvironment: "development" | "production" | "test",
): DesktopProfilePaths {
  const override = process.env.SURFACE_DESKTOP_USER_DATA;
  const root = override
    ? resolve(override)
    : join(
        process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
        appEnvironment === "production" ? "Surface" : "Surface Dev",
      );
  return {
    root,
    database: join(root, "surface.sqlite3"),
    data: join(root, "data"),
  };
}
