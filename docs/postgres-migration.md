# PostgreSQL migration and recovery

Surface now uses the existing PostgreSQL 17 container `primary-pg`:

- Production database: `surface-data`.
- Development database: `surface-dev-data`, initialized with the same schema and no production records.
- Local connections use `127.0.0.1:5432`. Docker connections use `primary-pg:5432` on the external `grill-me_default` network.
- Local credentials are in ignored `.env` and `apps/backend/.env` files. Tracked examples contain placeholders only.

## Configuration

`APP_ENV=production` selects `PRODUCTION_DATABASE_URL`; development selects
`DEVELOPMENT_DATABASE_URL`. `DATABASE_URL` explicitly overrides selection.
Development and test startup reject database `surface-data`. Tests require an
isolated `surface-test-*` database; `bun --cwd apps/backend test` creates and
removes one automatically.

The root `.env` also defines `DOCKER_DATABASE_URL` for production Compose and
`POSTGRES_NETWORK` for its external network. Compose does not manage the PostgreSQL
container or volume. If `primary-pg` is recreated, retain its persistent volume
and attach it to the network specified by `POSTGRES_NETWORK`.

Snapshots and the login signing key remain in `DATA_DIR`, independently of SQL.
Defaults are `data/` in production and `data/development/` in development.
Docker mounts the production directory at `/data`.

## Migration record: 2026-10-23

The original SQLite backend and Drizzle Studio were stopped before the final
backup. The SQLite backup API captured committed WAL contents; both integrity and
foreign-key checks passed. The source database and its assets were preserved.

Backup directory, relative to the repository:

`data/backups/postgres-migration-20261023T072855Z/`

Its contents include:

- `final-surface.sqlite`: final consistent source backup used for the import.
- `surface.sqlite`: earlier online backup.
- `filesystem-assets.tar.gz`: snapshots and the production session signing key.
- `sqlite-drizzle/`: original SQLite migrations and history definitions.
- Environment-file backups: original configuration for recovery.
- `rehearsal-verification.json`: table counts and row-content hashes from rehearsal.
- `production-verification.json`: corresponding production import verification.
- `surface-data.postgres.dump`: PostgreSQL custom-format dump after import and before application startup.
- `restored-backup-verification.json`: every source row matched again after restoring the PostgreSQL dump to an isolated database.

All 26 application tables were migrated, including 7,896 jobs, 7,897 source links,
8,250 job versions, 8,806 observations, the profile and revision history, research,
assessments, work history and saved settings. PostgreSQL has its own Drizzle history;
SQLite's bookkeeping table is preserved in the SQLite backup rather than imported
as PostgreSQL migration history.

The schema uses PostgreSQL `boolean`, `jsonb`, `bigint` for lease expiry, and a
serial research-event ID. Timestamps remain text to preserve their original values.
The completed import compared all columns and every normalized row, including
nulls and JSON content, using SHA-256 hashes before committing. It checked exact
table and column sets, refused nonempty destinations, inserted in foreign-key
order, and reset serial sequences above the copied IDs. Constraints remained
enabled throughout. The one-time transfer helpers were removed after verification.

## Future production changes

Stop application writers and take a new database dump before schema changes:

```sh
umask 077
docker exec primary-pg pg_dump -U prajwal-17 -Fc surface-data > /secure/backup/surface-data.dump
```

Back up `DATA_DIR/snapshots` and `DATA_DIR/.surface-auth-secret` as well. Rehearse
schema changes on an isolated restore before applying them to production:

```sh
APP_ENV=production bun run db:migrate
```

Startup also applies pending migrations. Keep schema rollouts coordinated with
application deployment; the migration runner does not automatically create dumps.

## Restore a backup safely

Restore into a new database first. The following example creates a recovery copy;
it does not overwrite the active production database:

```sh
docker exec primary-pg createdb -U prajwal-17 surface-recovery-data
docker exec -i primary-pg pg_restore -U prajwal-17 --exit-on-error --no-owner \
  -d surface-recovery-data < data/backups/postgres-migration-20261023T072855Z/surface-data.postgres.dump
```

Validate the restored data, constraints and application behavior. Stop writers
before deliberately switching production URLs to the verified recovery database.
Restore the matching filesystem assets and preserve the session signing key.

The retained SQLite files and previous Git revision provide a pre-cutover recovery
path. If PostgreSQL has received new writes since cutover, first back up PostgreSQL
and reconcile those changes before reverting; the SQLite backup only contains data
up to the migration cutoff. Never copy an older backup over a live database.
