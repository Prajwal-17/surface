import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const file of [
  ...new Bun.Glob("src/**/*.test.ts").scanSync(),
].toSorted()) {
  const directory = mkdtempSync(join(tmpdir(), "surface-backend-test-"));
  try {
    // Each suite gets a new module cache, database, and asset directory.
    const child = Bun.spawn(["bun", "test", file], {
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        APP_ENV: "test",
        NODE_ENV: "test",
        SQLITE_DATABASE_FILE: ":memory:",
        SQLITE_MIGRATIONS_DIR: undefined,
        DATA_DIR: directory,
      },
    });
    if (await child.exited) process.exitCode = 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
