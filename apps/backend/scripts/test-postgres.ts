import postgres from "postgres";
import { env } from "../src/config/env";

// Always create an isolated disposable database. No tests run on either application DB.
const name = `surface-test-${crypto.randomUUID()}`;
if (!env.DATABASE_URL) throw new Error("TEST_DATABASE_URL is required.");
const adminUrl = new URL(env.DATABASE_URL);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1 });
const testUrl = new URL(env.DATABASE_URL);
testUrl.pathname = `/${name}`;
let created = false;
try {
  await admin`CREATE DATABASE ${admin(name)}`;
  created = true;
  // Test modules own their DB clients and network mocks. Separate processes keep
  // module caches and teardown from one suite from closing another suite's pool.
  process.exitCode = 0;
  for (const file of Array.from(
    new Bun.Glob("src/**/*.test.ts").scanSync(),
  ).toSorted()) {
    const child = Bun.spawn(["bun", "test", file], {
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        APP_ENV: "test",
        NODE_ENV: "test",
        DATABASE_URL: testUrl.toString(),
        TEST_DATABASE_URL: testUrl.toString(),
      },
    });
    if (await child.exited) process.exitCode = 1;
  }
} finally {
  if (created) {
    await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${name} AND pid<>pg_backend_pid()`;
    await admin`DROP DATABASE ${admin(name)}`;
  }
  await admin.end();
}
