import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";

const temporary = mkdtempSync(join(tmpdir(), "surface-pglite-verification-"));
const databaseDirectory = join(temporary, "database");
const dataDirectory = join(temporary, "data");
process.env.APP_ENV = "production";
process.env.NODE_ENV = "production";
process.env.PGLITE_DATA_DIR = databaseDirectory;
process.env.DATA_DIR = dataDirectory;

const checks: Record<string, unknown> = {};
try {
  const { runMigrations, resolveMigrationsFolder } = await import(
    "../src/infrastructure/database/migrate.ts"
  ).then(async (module) => ({
    runMigrations: module.runMigrations,
    resolveMigrationsFolder: (
      await import("../src/infrastructure/database/client.ts")
    ).resolveMigrationsFolder,
  }));
  const { closeDatabase, db, pg } = await import(
    "../src/infrastructure/database/client.ts"
  );
  const { lockCoordination } = await import(
    "../src/infrastructure/database/locks.ts"
  );
  const { companies, configuredSources } = await import(
    "../src/modules/workspace/workspace.tables.ts"
  );
  const { jobs } = await import("../src/modules/jobs/jobs.tables.ts");
  const { workItems } = await import("../src/modules/work/work.tables.ts");
  const { recoverInterruptedWork } = await import(
    "../src/modules/work/executor.ts"
  );
  const { upsertCandidates } = await import(
    "../src/modules/jobs/jobs.repository.ts"
  );
  const { persistSnapshot } = await import(
    "../src/modules/collection/snapshots.ts"
  );
  const { enqueueCollection } = await import(
    "../src/modules/work/work.service.ts"
  );

  const folder = resolveMigrationsFolder();
  checks.migrationsFolder = folder;
  await runMigrations();
  checks.migrationsApplied = true;
  const tables = await pg<{ n: number }[]>`
    SELECT count(*)::integer AS n FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'`;
  checks.tableCount = tables[0]!.n;
  if (checks.tableCount !== 32) {
    throw new Error(`Expected 32 application tables, found ${checks.tableCount}`);
  }

  const foreignKeys = await pg<{ n: number }[]>`
    SELECT count(*)::integer AS n FROM pg_constraint con
    JOIN pg_class source ON source.oid=con.conrelid
    JOIN pg_namespace ns ON ns.oid=source.relnamespace
    WHERE con.contype='f' AND ns.nspname='public'`;
  checks.foreignKeyCount = foreignKeys[0]!.n;

  const nestedQuery = await pg<{ name: string }[]>`
    SELECT c.column_name AS name
    FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name='jobs'
    ORDER BY c.ordinal_position`;
  checks.rawInformationSchemaRows = nestedQuery.length;

  const rawJson = await pg<{ value: string }[]>`
    SELECT jsonb_build_object('ok', true, 'n', 2)::text AS value`;
  checks.rawJsonb = rawJson[0]!.value;

  const committedId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await lockCoordination(tx, "verification:transaction");
    await tx.insert(companies).values({
      id: committedId,
      name: "Verification Co",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  const committed = (
    await db.select().from(companies).where(sql`${companies.id}=${committedId}`)
  ).length;
  checks.transactionCommit = committed === 1;

  const rolledBackId = crypto.randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(companies).values({
        id: rolledBackId,
        name: "Rolled Back Co",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      throw new Error("rollback probe");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "rollback probe") throw error;
  }
  const rolledBack = (
    await db.select().from(companies).where(sql`${companies.id}=${rolledBackId}`)
  ).length;
  checks.transactionRollback = rolledBack === 0;

  const lockRows = await pg<{ n: number }[]>`
    SELECT count(*)::integer AS n FROM coordination_locks`;
  checks.coordinationLockRowsAfterCommit = lockRows[0]!.n;

  const now = new Date().toISOString();
  const upserted = await upsertCandidates([
    {
      source: "remotive",
      externalId: "verification-job",
      title: "Verification Engineer",
      company: "Verification Co",
      companyId: committedId,
      location: "Remote",
      isRemote: true,
      employmentType: "full-time",
      description: "A deterministic job used to verify the embedded database.",
      applyUrl: "https://verification.example/jobs/1",
      sourceUrl: "https://verification.example/jobs/1",
      postedAt: now,
      tags: [],
    },
  ]);
  checks.jobUpsert = upserted;
  const jobRows = await db.select().from(jobs);
  checks.embeddedJobs = jobRows.length;
  if (jobRows.length !== 1 || jobRows[0]!.title !== "Verification Engineer") {
    throw new Error("Job upsert did not persist in PGlite.");
  }

  const snapshot = await persistSnapshot({
    url: "https://verification.example/jobs/1",
    body: "<html><body>Verification evidence</body></html>",
    rawBytes: Buffer.from("<html><body>Verification evidence</body></html>"),
    mediaType: "text/html",
    statusCode: 200,
  });
  checks.snapshotPersisted = Boolean(snapshot.snapshotId);
  const snapshotHash = (
    await pg<{ hash: string }[]>`
      SELECT hash FROM snapshots WHERE id=${snapshot.snapshotId}`
  )[0]!.hash;
  checks.snapshotFile = existsSync(
    join(dataDirectory, "snapshots", snapshotHash),
  );

  const sourceId = crypto.randomUUID();
  await db.insert(configuredSources).values({
    id: sourceId,
    label: "Verification feed",
    url: "https://verification.example/feed",
    endpoint: "https://verification.example/feed",
    provider: "remotive",
    support: "supported",
    reason: "Verification source",
    createdAt: now,
    updatedAt: now,
    scheduleHours: 12,
  });
  const queued = await enqueueCollection([sourceId], "Verification");
  const queuedWork = await db.select().from(workItems);
  checks.monitoringQueue = queuedWork.some(
    (item) => item.kind === "collection" && item.state === "queued",
  );
  checks.queuedRunId = queued.runId;

  const advisory = await pg<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtext('surface:verification')) AS locked`;
  checks.advisoryLockSupported = advisory[0]!.locked === true;
  await pg`SELECT pg_advisory_unlock(hashtext('surface:verification'))`;

  const runningId = crypto.randomUUID();
  await db.insert(workItems).values({
    id: runningId,
    kind: "collection",
    sourceId: "verification-source",
    identity: `verification:${runningId}`,
    state: "running",
    retryAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  await recoverInterruptedWork();
  const recovered = (
    await db.select().from(workItems).where(sql`${workItems.id}=${runningId}`)
  )[0]!;
  checks.recoveryState = recovered.state;
  if (recovered.state !== "interrupted") {
    throw new Error(`Recovery left work item ${recovered.state}`);
  }

  await closeDatabase();
  checks.closedCleanly = true;

  const reopened = new PGlite(databaseDirectory);
  const persisted = await reopened.query<{ id: string }>(
    "SELECT id FROM companies",
  );
  checks.reopenedCompanies = persisted.rows.length;
  if (persisted.rows.length !== 1 || persisted.rows[0]!.id !== committedId) {
    throw new Error("Persistent reopen did not return the committed company.");
  }
  const reopenedWork = await reopened.query<{ id: string }>(
    "SELECT id FROM work_items",
  );
  checks.reopenedWorkItems = reopenedWork.rows.length;
  const reopenedMigrations = await reopened.query<{ id: number }>(
    "SELECT id FROM drizzle.__drizzle_migrations",
  );
  checks.reopenedMigrationRows = reopenedMigrations.rows.length;
  await reopened.close();

  const report = {
    ok: true,
    verifiedAt: new Date().toISOString(),
    temporaryDirectory: temporary,
    checks,
  };
  const output = process.argv[2];
  if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.info(JSON.stringify(report, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
