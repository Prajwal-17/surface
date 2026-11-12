import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { env } from "../src/config/env";
// Always restore to an isolated database. This command never migrates its source.
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const sourceUrl = new URL(
  process.env.PRODUCTION_DATABASE_URL ?? env.DATABASE_URL,
);
const adminUrl = new URL(env.DATABASE_URL);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1 });
const name = `surface-test-company-rehearsal-${Date.now()}`,
  targetUrl = new URL(env.DATABASE_URL);
targetUrl.pathname = `/${name}`;
const directory = resolve(
  "../../data/backups",
  `company-discovery-${Date.now()}`,
);
await mkdir(directory, { recursive: true, mode: 0o700 });
const dump = resolve(directory, "before.dump"),
  container = process.env.POSTGRES_CONTAINER ?? "primary-pg",
  user = decodeURIComponent(sourceUrl.username),
  source = decodeURIComponent(sourceUrl.pathname.slice(1));
let created = false;
try {
  const backup = Bun.spawn(
    ["docker", "exec", container, "pg_dump", "-U", user, "-Fc", source],
    { stdout: Bun.file(dump), stderr: "inherit" },
  );
  if (await backup.exited) throw new Error("Database dump failed.");
  await admin`CREATE DATABASE ${admin(name)}`;
  created = true;
  const restore = Bun.spawn(
    [
      "docker",
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      user,
      "--no-owner",
      "--exit-on-error",
      "-d",
      name,
    ],
    { stdin: Bun.file(dump), stdout: "ignore", stderr: "inherit" },
  );
  if (await restore.exited) throw new Error("Isolated restore failed.");
  const target = postgres(targetUrl.toString(), { max: 1 });
  const tables = await target<
    { table_name: string }[]
  >`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`;
  const hash = (rows: unknown[]) =>
    new Bun.CryptoHasher("sha256")
      .update(JSON.stringify(rows.map((r) => JSON.stringify(r)).toSorted()))
      .digest("hex");
  const before: Record<
    string,
    { columns: string[]; count: number; digest: string }
  > = {};
  for (const t of tables) {
    const cols = await target<
      { column_name: string }[]
    >`select column_name from information_schema.columns where table_schema='public' and table_name=${t.table_name} order by ordinal_position`;
    const columns = cols.map((c) => c.column_name);
    const rows =
      await target`SELECT ${target(columns)} FROM ${target(t.table_name)}`;
    before[t.table_name] = { columns, count: rows.length, digest: hash(rows) };
  }
  const migration = Bun.spawn(
    ["bun", "src/infrastructure/database/migrate.ts"],
    {
      env: {
        ...process.env,
        APP_ENV: "test",
        DATABASE_URL: targetUrl.toString(),
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (await migration.exited)
    throw new Error("Migration failed on isolated restore.");
  for (const [table, b] of Object.entries(before)) {
    const rows =
      await target`SELECT ${target(b.columns)} FROM ${target(table)}`;
    if (rows.length !== b.count || hash(rows) !== b.digest)
      throw new Error(`Existing rows changed in ${table}.`);
  }
  const added =
    await target`select table_name from information_schema.tables where table_schema='public' and table_name like 'company_%' order by table_name`;
  const result = {
    database: name,
    sourceDatabase: source,
    verifiedAt: new Date().toISOString(),
    existingTables: tables.length,
    preservedRowCounts: Object.fromEntries(
      Object.entries(before).map(([k, v]) => [k, v.count]),
    ),
    companyTables: added.map((r) => r.table_name),
    status: "passed",
    dump,
  };
  await writeFile(
    resolve(directory, "verification.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.info(JSON.stringify(result));
  await target.end();
  if (process.env.KEEP_REHEARSAL_DATABASE === "true") {
    created = false;
    await writeFile(
      "/tmp/surface-company-rehearsal-env",
      `DATABASE_URL=${targetUrl.toString()}\n`,
      { mode: 0o600 },
    );
  }
} finally {
  if (created) {
    await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${name} AND pid<>pg_backend_pid()`;
    await admin`DROP DATABASE ${admin(name)}`;
  }
  await admin.end();
}
