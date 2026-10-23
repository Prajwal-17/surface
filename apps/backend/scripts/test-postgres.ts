import postgres from "postgres";
import { env } from "../src/config/env";

// Always create an isolated disposable database. No tests run on either application DB.
const name = `surface-test-${crypto.randomUUID()}`;
const adminUrl = new URL(env.DATABASE_URL);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1 });
const testUrl = new URL(env.DATABASE_URL);
testUrl.pathname = `/${name}`;
let created = false;
try {
  await admin`CREATE DATABASE ${admin(name)}`;
  created = true;
  const child = Bun.spawn(["bun", "test", "src"], {
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
  process.exitCode = await child.exited;
} finally {
  if (created) {
    await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${name} AND pid<>pg_backend_pid()`;
    await admin`DROP DATABASE ${admin(name)}`;
  }
  await admin.end();
}
