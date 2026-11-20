# Desktop data import

The desktop app stores its data in a local `surface.sqlite3` database. The web
deployment still uses PostgreSQL. Data is not shared or synchronized between the
two automatically; the import command copies a consistent PostgreSQL snapshot
into a desktop profile once.

The importer is
[`apps/backend/scripts/import-desktop-data.ts`](../apps/backend/scripts/import-desktop-data.ts).
It never writes to PostgreSQL. Snapshots and the previous desktop database are
preserved.

## Safety model

1. PostgreSQL is read through a `REPEATABLE READ, READ ONLY` transaction.
2. A fresh staging SQLite database is created by applying the desktop baseline
   in `apps/backend/drizzle-sqlite/`; production PostgreSQL migrations are never
   applied to SQLite.
3. Every PostgreSQL table must have a SQLite counterpart with exactly the same
   column names and compatible types. A source table without a counterpart, or
   a shared table with different columns, aborts the import. SQLite-only tables
   such as `coordination_locks` must be empty.
4. Rows are inserted in foreign-key order with SQLite foreign keys enabled.
5. Every row is hashed in both databases from the same normalized column values.
   Table digests and row counts must match exactly before installation.
6. Only referenced snapshot files are copied, and every file is checked against
   its content-addressed filename and `snapshots.byte_length`.
7. Installation refuses to run while the desktop app is using the target
   database. The existing `surface.sqlite3`, `-wal`, and `-shm` files are moved
   to `<userData>/import-backups/<timestamp>/` before an atomic replacement.

The production database, container volume, `DATA_DIR`, and existing desktop
profile are never deleted.

## Commands

Run from the repository root. `PRODUCTION_DATABASE_URL` is loaded from
`apps/backend/.env`; `--database-url` overrides it.

```sh
# Build and verify staging without touching the desktop profile
bun run desktop:import -- export \
  --staging /secure/surface-import

# Install the verified staging profile
bun run desktop:import -- install \
  --staging /secure/surface-import \
  --target-profile "$HOME/.config/Surface" \
  --replace

# Or do both in one run
bun run desktop:import -- migrate --replace

# Verify the installed profile against the import report
bun run desktop:import -- verify \
  --target-profile "$HOME/.config/Surface" \
  --report "$HOME/.config/Surface/import-backups/<timestamp>/import-report.json"
```

`--data-dir` defaults to `DATA_DIR` or the repository `data/` directory. The
wrapper runs from `apps/backend`, so pass an absolute path when overriding it;
the default is resolved from the repository root.
`--target-profile` defaults to `SURFACE_DESKTOP_USER_DATA` or
`~/.config/Surface`.

The source database must be named `surface-data`. Use
`--allow-any-database` only for an isolated test copy of that database.

Quit Surface before `install` or `migrate`. The importer detects processes that
have the target SQLite file open and aborts rather than replacing a live
database.

## What is copied

- Every application table shared by PostgreSQL and SQLite, including jobs,
  sources, versions, observations, duplicate decisions, companies, research,
  assessments, profile revisions, runs, work items, snapshots, and settings.
- PostgreSQL `boolean` and `bigint` values become SQLite integers; `jsonb`
  values keep their exact JSON text; text timestamps stay text.
- `research_events.id` keeps its serial IDs and the SQLite sequence is set above
  the largest imported ID.
- Referenced files from `DATA_DIR/snapshots` and any company logos referenced by
  `companies.logo_path`.

Not copied:

- `drizzle.__drizzle_migrations` migration bookkeeping.
- Desktop `settings.json` (OpenCode Go key, SearXNG URL, AI model, and window
  preferences). Configure these in the app after the import.
- `DATA_DIR/.surface-auth-secret`; the desktop app uses a per-launch token.
- Unreferenced files in `DATA_DIR/snapshots`. Existing files in the desktop
  profile are kept.

## Root-owned snapshot files

The production backend container may write snapshots as root, leaving files in
`DATA_DIR/snapshots` readable only by root. Copy them to a directory owned by the
user before exporting:

```sh
mkdir -p /secure/surface-snapshots/snapshots
docker run --rm \
  -v "$PWD/data/snapshots:/src:ro" \
  -v "/secure/surface-snapshots/snapshots:/dst" \
  postgres:17-alpine \
  sh -c 'cp -a /src/. /dst/ && chown -R 1000:1000 /dst'
bun run desktop:import -- export \
  --data-dir /secure/surface-snapshots \
  --staging /secure/surface-import
```

The importer still verifies every copied file against the database's content
hash.

## Verification report

`<staging>/import-report.json` and the installed copy in
`<userData>/import-backups/<timestamp>/import-report.json` contain:

- Source database name and host, without credentials.
- Applied SQLite migration count.
- Row count and SHA-256 digest for every table.
- Tables present only in SQLite (must be empty).
- Snapshot counts, bytes, and verification totals.
- SQLite table, column, and foreign-key counts.
- Warnings such as missing company logo files.

The `verify` command recomputes all table digests and snapshot hashes from the
installed profile. `PRAGMA integrity_check` must return `ok` and
`PRAGMA foreign_key_check` must return no rows.

## Rollback

The previous database is at
`<userData>/import-backups/<timestamp>/surface.sqlite3` with a checksum in
`manifest.json`. To roll back, quit Surface, move the imported
`surface.sqlite3` aside (do not delete it), and copy the backup back to
`<userData>/surface.sqlite3`. Remove any stale `-wal` and `-shm` files from the
target first. Snapshots are content-addressed and additive, so the restored
database can still use them.

The original PostgreSQL database and the `pg_dump -Fc` backup taken before the
export remain the recovery source for the web deployment. Do not restore an
older dump over a live PostgreSQL database that has received new writes.

## Refreshing a desktop profile later

Re-run `migrate` after quitting Surface. The desktop profile is replaced again
and the prior database is backed up. Changes made only in the desktop app are
not copied back to PostgreSQL. Decide which side is authoritative before
refreshing, and preserve both databases until the new profile is verified.
