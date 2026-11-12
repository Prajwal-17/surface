# Desktop migration verification

This report records what was actually run for the Electron/Surface migration on
the Linux build host. Commands were run against copied or temporary data. The
production deployment was not started, stopped, migrated, or otherwise mutated.

## Milestone commits

- `744989f` — Node backend, PGlite driver, row-lock coordination, verification.
- `145e633` — checksummed desktop export/import and data CLI.
- `8f5b49e` — Electron shell, settings UI, SearXNG Compose, packaging, docs.

AppImage SHA-256:
`31d04e2ebf059123cab9fb6ac3820c0b2e71d4398aefa6a7ff7132ee66c4f210`
(`data/desktop-verification/AppImage.sha256`).

## Safety boundary

- No production container was started, stopped, recreated, or removed.
- No production Docker volume, network, database, snapshot directory, or backup
  was modified. `primary-pg` was not present in this isolated environment.
- The existing production backup was copied read-only to
  `data/desktop-verification/` before use:
  - `source-backup/surface-data.postgres.dump`
  - `assets/` extracted from `filesystem-assets.tar.gz`
- Compatibility and import tests used a disposable PostgreSQL 17 container
  (`surface-migration-verify-*`) with a host bind mount under
  `data/desktop-verification/pgdata` on port `55432`. It uses no production
  volume or network and was removed after verification.
- All desktop/import profiles are under `data/desktop-verification/`. No
  `~/.config/Surface` profile was used for tests.
- The source dump and extracted assets remain in place for rollback/rechecking.

This environment could not run the live production export because the
production database container is absent. That is why the copy above was used.
The exported format is Surface's own manifest + JSONL, not `pg_dump`; the
tooling refuses arbitrary dumps rather than assuming PostgreSQL compatibility.

## Embedded PGlite compatibility

Command:

```sh
cd apps/backend
node --import tsx scripts/verify-pglite.ts \
  ../../data/desktop-verification/pglite-verification.json
```

Evidence: `data/desktop-verification/pglite-verification.json` and `.log`.

Recorded checks:

- 4 Drizzle migrations applied in a new temporary directory.
- 32 application tables and 34 foreign keys.
- Raw `information_schema`, `jsonb_build_object`, and boolean SQL worked.
- Commit and rollback transactions behaved correctly.
- A committed coordination row lock and a recognized advisory lock both worked.
- Job upsert inserted a job; configured source enqueue created a queued
  monitoring work item.
- Snapshot persistence wrote the hash-addressed evidence file.
- Interrupted work recovery changed a running item to `interrupted`.
- Clean close followed by a new PGlite instance reopened the committed company,
  work rows and all 4 migration records.

The code no longer depends on advisory locks for enqueue coordination. It uses
`coordination_locks` row locks in `lockCoordination`, which behaves in both
PostgreSQL and PGlite.

## Export and import verification

Source: copied production dump restored into the disposable PostgreSQL 17
container. It contained 26 public tables and the older schema; import applied
the newer `0001`–`0003` migrations.

Commands (abridged):

```sh
node --import tsx scripts/desktop-data.ts export \
  --output ../../data/desktop-verification/export \
  --database-url postgresql://verify:verify@127.0.0.1:55432/surface-data \
  --data-dir ../../data/desktop-verification/assets/data

node --import tsx scripts/desktop-data.ts import \
  --input ../../data/desktop-verification/export \
  --user-data ../../data/desktop-verification/user-data

node --import tsx scripts/desktop-data.ts verify \
  --input ../../data/desktop-verification/export \
  --user-data ../../data/desktop-verification/user-data
```

Evidence:

- `data/desktop-verification/export.log`
- `data/desktop-verification/import.log`
- `data/desktop-verification/verify.log`
- `data/desktop-verification/export/manifest.json`
- `data/desktop-verification/user-data/data/import-manifest.json`

Imported totals:

| Check | Result |
| --- | --- |
| Tables | 26 exported, newer migrations applied on import |
| Rows | 33,895 |
| Jobs | 7,896 |
| Job sources | 7,897 |
| Job versions | 8,250 |
| Observations | 8,806 |
| Profile revisions | 6 |
| Analysis settings | 1 verified |
| Snapshot files | 58 content-hash verified |
| Snapshot/observation links | verified |
| Company logo links | 0 referenced |
| Session signing key | checksum verified |

Every table row count and content SHA-256 matched; each table also matched its
representative-record hash. `import-manifest.json` records the checks. The
packaged app repeated the same import and verify successfully.

## Node backend and packaged app

Backend checks:

- `node apps/backend/scripts/build.mjs` produced an ESM Node bundle.
- Running `dist/index.mjs` with PGlite returned `200` for `/api/health`, served
  the Vite SPA at `/settings`, and served hashed assets.
- `bun run lint`, `bun run check-types`, and `bun run build` passed.
- Backend tests: 18 pass, 0 fail against the disposable PostgreSQL test
  database (`data/desktop-verification/backend-tests.log`).
- Crawler tests: 7 pass, 0 fail (`crawler-tests.log`).
- Web tests: 36 pass, 0 fail (`web-tests.log`).

Packaged artifact:

- `apps/desktop/release/Surface-0.1.0-x86_64.AppImage`
- `apps/desktop/release/linux-unpacked/surface`

Recorded smoke evidence:

- `data/desktop-verification/final-app-run1.log`
- `data/desktop-verification/final-app-run2.log`
- `data/desktop-verification/final-appimage-fuse.log`
- `data/desktop-verification/appimage-imported-smoke.log`
- `data/desktop-verification/packaged-data-import.log`
- `data/desktop-verification/packaged-data-verify2.log`
- `data/desktop-verification/appimage-data-verify.log`
- `data/desktop-verification/final-appimage-data-verify.log`
- `data/desktop-verification/single-instance.log`
- `data/desktop-verification/second-instance.log`
- `data/desktop-verification/port-conflict.log`
- `data/desktop-verification/failure-settings.log`
- `data/desktop-verification/failure-backend.log`

Observed:

- Fresh AppImage: backend and crawler became ready, 32 tables existed, loopback
  ports were allocated, auth via the app-owned cookie succeeded, settings saved
  through preload/IPC, and shutdown completed.
- Second run with the same user data: the database and encrypted settings
  persisted, and a different backend port was allocated.
- Imported AppImage profile: 7,930 jobs and 5 research companies opened; the
  schema had 32 tables.
- The same imported profile in another run started collection and grew to
  11,785 jobs before the smoke shutdown, demonstrating monitoring/collection in
  the packaged process (only the disposable profile was changed).
- A second launch exited immediately while the first stayed alive; terminating
  the first left no backend/crawler processes.
- A deliberately occupied backend port produced exit code 1 with a clear
  backend-bind error, no orphan processes, and no database corruption.
- Invalid settings and an unbootable PGlite directory produced exit code 1 with
  clear logs and no orphan processes.
- Imported data verification in the packaged app matched all rows, settings and
  58 snapshots. The AppImage `--surface-data verify` command also passed.
- The settings file was mode `0600`, used `safeStorage` ciphertext, and did not
  contain the test key in plaintext.

## SearXNG and research behavior

- A disposable SearXNG container on `127.0.0.1:18080` returned JSON results;
  `search_web` returned 12 normalized results.
- With SearXNG unavailable, `search_web` returned HTTP 502:
  “Cannot reach SearXNG. Start the search service and check SEARXNG_BASE_URL.”
- `/api/desktop/diagnostics` reported SearXNG unavailable while the jobs API
  still returned the imported 7,930 jobs.
- With SearXNG running, diagnostics reported `ok: true`, HTTP 200 and 20
  results.
- The crawler package (staged Chromium) fetched `https://example.com/` and
  returned a readable page.
- A disposable OpenAI-compatible model endpoint completed a company research
  question through `/api/companies/:id/research/questions`; the run completed
  and the answer persisted. This exercised the real research lifecycle without
  claiming a live OmniRoute call.

No live OmniRoute model was available in this environment. AI output quality
and provider-specific tool-calling remain to be checked against the user's
external OmniRoute endpoint.

## Remaining blockers / follow-ups

- Run the export command against the live production database once it is
  reachable, then import into a fresh desktop profile on the target account.
  This report used a copied production dump because `primary-pg` was not
  running here.
- Verify AI summaries/assessments/research with the real OmniRoute endpoint and
  chosen model. A fake OpenAI-compatible endpoint was used for the lifecycle
  test only.
- The AppImage was run through `--appimage-extract-and-run` and also directly
  through FUSE; both started and shut down cleanly.
- The package is unsigned and uses the default Electron icon. Tray, close-to-tray
  and autostart are intentionally deferred.
- `safeStorage` protection depends on the Linux keyring. The test host reported
  `os-encrypted`; hosts without a keyring will show `basic-text`/`plaintext` in
  Settings and should be treated accordingly.
