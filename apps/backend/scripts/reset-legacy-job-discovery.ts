import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databaseFile = process.env.SQLITE_DATABASE_FILE;
if (!databaseFile || databaseFile === ":memory:") {
  throw new Error(
    "Set SQLITE_DATABASE_FILE to an existing SQLite profile. This script never creates a database.",
  );
}
const path = resolve(databaseFile);
if (!existsSync(path)) throw new Error(`Database does not exist: ${path}`);

const apply = process.argv.includes("--apply");
if (apply && process.env.CONFIRM_LEGACY_JOB_RESET !== "1") {
  throw new Error(
    "Reset requires --apply and CONFIRM_LEGACY_JOB_RESET=1 after reviewing the preflight report.",
  );
}

const database = new DatabaseSync(path, {
  readOnly: !apply,
  enableForeignKeyConstraints: true,
});
const tableNames = new Set(
  (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
  ).map((row) => row.name),
);
const hasTable = (table: string) => tableNames.has(table);
const count = (table: string, where = "") => {
  if (!hasTable(table)) return 0;
  const suffix = where ? ` WHERE ${where}` : "";
  return (
    database
      .prepare(`SELECT count(*) AS count FROM "${table}"${suffix}`)
      .get() as {
      count: number;
    }
  ).count;
};
const groups = (table: string, fields: string[]) => {
  if (!hasTable(table)) return [];
  const groupBy = fields.map((field) => `"${field}"`).join(", ");
  return database
    .prepare(
      `SELECT ${groupBy}, count(*) AS count FROM "${table}" GROUP BY ${groupBy} ORDER BY ${groupBy}`,
    )
    .all();
};
const applicationFingerprint = () => {
  const columns = (
    database.prepare("PRAGMA table_info(applications)").all() as {
      name: string;
    }[]
  )
    .map((column) => column.name)
    .filter((column) => column !== "job_id")
    .map((column) => `"${column}"`)
    .join(",");
  return JSON.stringify(
    database.prepare(`SELECT ${columns} FROM applications ORDER BY id`).all(),
  );
};
const companyFingerprint = () =>
  JSON.stringify(database.prepare("SELECT * FROM companies ORDER BY id").all());

const snapshot = () => ({
  targets: {
    jobs: count("jobs"),
    jobSources: count("job_sources"),
    observations: count("observations"),
    jobVersions: count("job_versions"),
    duplicateDecisions: count("duplicate_decisions"),
    assessments: count("assessments"),
    configuredSources: count("configured_sources"),
    collectionWorkItems: count("work_items", "kind='collection'"),
    collectionRuns: count("runs", "kind='collection'"),
    analysisWorkItems: count("work_items", "kind='analysis'"),
    analysisRuns: count("runs", "kind='analysis'"),
    collectionRunItems:
      hasTable("run_items") && hasTable("runs") && hasTable("work_items")
        ? (
            database
              .prepare(
                `SELECT count(*) AS count FROM run_items ri
                 WHERE ri.run_id IN (SELECT id FROM runs WHERE kind='collection')
                    OR ri.work_id IN (SELECT id FROM work_items WHERE kind='collection')`,
              )
              .get() as { count: number }
          ).count
        : 0,
    analysisRunItems:
      hasTable("run_items") && hasTable("runs") && hasTable("work_items")
        ? (
            database
              .prepare(
                `SELECT count(*) AS count FROM run_items ri
                 WHERE ri.run_id IN (SELECT id FROM runs WHERE kind='analysis')
                    OR ri.work_id IN (SELECT id FROM work_items WHERE kind='analysis')`,
              )
              .get() as { count: number }
          ).count
        : 0,
    applicationJobReferences: count("applications", "job_id IS NOT NULL"),
    companyActionJobReferences: count("company_actions", "job_id IS NOT NULL"),
  },
  workerState: {
    workItems: groups("work_items", ["kind", "state"]),
    runs: groups("runs", ["kind", "state"]),
    executorLease: hasTable("executor_lease")
      ? (() => {
          const lease = database
            .prepare("SELECT expires_at FROM executor_lease WHERE id='backend'")
            .get() as { expires_at: number } | undefined;
          return lease
            ? {
                active: lease.expires_at > Date.now(),
                expiresAt: new Date(lease.expires_at).toISOString(),
              }
            : null;
        })()
      : null,
  },
  jobSourcesByProvider: hasTable("job_sources")
    ? groups("job_sources", ["source"])
    : [],
  preserved: {
    applications: count("applications"),
    companies: count("companies"),
    applicationStatuses: groups("applications", ["status"]),
    resources: count("resources"),
    snapshots: count("snapshots"),
    jobSearchSettings: count("job_search_settings"),
    jobSearchRuns: count("job_search_runs"),
    jobSearchSeen: count("job_search_seen"),
  },
});

const before = snapshot();
console.info(
  JSON.stringify(
    {
      mode: apply ? "apply" : "preflight-only",
      database: path,
      reset: before,
      note: "Resources and snapshots are retained because company research uses them as cached evidence.",
    },
    null,
    2,
  ),
);

if (!apply) {
  console.info(
    "No data changed. Review this report before running with --apply.",
  );
  database.close();
  process.exit(0);
}

if (hasTable("executor_lease")) {
  const lease = database
    .prepare("SELECT owner,expires_at FROM executor_lease WHERE id='backend'")
    .get() as { owner: string; expires_at: number } | undefined;
  if (lease && lease.expires_at > Date.now()) {
    database.close();
    throw new Error(
      `Backend worker lease is active for ${lease.owner}; stop the backend before resetting legacy data.`,
    );
  }
}

const applicationsBefore = applicationFingerprint();
const companiesBefore = companyFingerprint();
const backupPath = `${path}.before-legacy-job-reset-${Date.now()}.sqlite3`;
const sqlLiteral = backupPath.replaceAll("'", "''");
database.exec(`VACUUM INTO '${sqlLiteral}'`);
database.exec("BEGIN IMMEDIATE");
try {
  if (hasTable("applications"))
    database.exec(
      "UPDATE applications SET job_id=NULL WHERE job_id IS NOT NULL",
    );
  if (hasTable("company_actions"))
    database.exec(
      "UPDATE company_actions SET job_id=NULL WHERE job_id IS NOT NULL",
    );
  if (hasTable("run_items") && hasTable("runs") && hasTable("work_items"))
    database.exec(
      `DELETE FROM run_items
       WHERE run_id IN (SELECT id FROM runs WHERE kind IN ('collection','analysis'))
          OR work_id IN (SELECT id FROM work_items WHERE kind IN ('collection','analysis'))`,
    );
  if (hasTable("assessments")) database.exec("DELETE FROM assessments");
  if (hasTable("duplicate_decisions"))
    database.exec("DELETE FROM duplicate_decisions");
  if (hasTable("job_versions")) database.exec("DELETE FROM job_versions");
  if (hasTable("observations")) database.exec("DELETE FROM observations");
  if (hasTable("job_sources")) database.exec("DELETE FROM job_sources");
  if (hasTable("jobs")) database.exec("DELETE FROM jobs");
  if (hasTable("configured_sources"))
    database.exec("DELETE FROM configured_sources");
  if (hasTable("work_items"))
    database.exec(
      "DELETE FROM work_items WHERE kind IN ('collection','analysis')",
    );
  if (hasTable("runs"))
    database.exec("DELETE FROM runs WHERE kind IN ('collection','analysis')");
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  database.close();
  throw error;
}

const after = snapshot();
const applicationsAfter = applicationFingerprint();
const companiesAfter = companyFingerprint();
if (
  applicationsBefore !== applicationsAfter ||
  companiesBefore !== companiesAfter
) {
  database.close();
  throw new Error(
    "The reset changed protected Applications or Companies data. Restore the backup and investigate.",
  );
}
const violations = database.prepare("PRAGMA foreign_key_check").all();
if (violations.length) {
  database.close();
  throw new Error("Foreign-key violations found after legacy reset.");
}
database.close();
console.info(
  JSON.stringify(
    {
      mode: "complete",
      backup: backupPath,
      after,
      protectedApplicationsAndCompanies: "unchanged",
    },
    null,
    2,
  ),
);
