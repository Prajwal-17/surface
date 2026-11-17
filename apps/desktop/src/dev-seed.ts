import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface DevelopmentSeedPaths {
  seedDirectory: string;
  database: string;
  data: string;
}

/**
 * Development-only convenience: seed a new local profile from the packaged
 * production-data snapshot. Existing profiles are never replaced.
 */
export function applyDevelopmentSeed(
  paths: DevelopmentSeedPaths,
): { applied: true } | { applied: false; reason: string } {
  const seedDatabase = join(paths.seedDirectory, "surface.sqlite3");
  if (!existsSync(seedDatabase))
    return { applied: false, reason: "no packaged seed" };
  if (existsSync(paths.database))
    return { applied: false, reason: "profile already has a database" };
  mkdirSync(dirname(paths.database), { recursive: true, mode: 0o700 });
  cpSync(seedDatabase, paths.database);
  for (const folder of ["snapshots", "company-logos"]) {
    const source = join(paths.seedDirectory, "data", folder);
    if (existsSync(source))
      cpSync(source, join(paths.data, folder), { recursive: true });
  }
  return { applied: true };
}
