# Surface desktop

Surface can run as one personal Linux desktop app. Electron starts two local
utility processes:

- the Node backend, using embedded PGlite with Drizzle migrations, and
- the Crawlee/Playwright crawler.

The renderer is the existing Vite web build, served by Hono on a loopback port.
Only SearXNG remains optional Docker infrastructure. OmniRoute remains external.
Existing Docker Compose production services are unchanged and are not required
by the desktop app.

## Requirements

- Linux x64 for the packaged AppImage. The build host needs Node 24 and Bun for
  the repository build scripts.
- Optional: Docker for SearXNG. No PostgreSQL container is needed.
- Optional: an OmniRoute endpoint and API key for AI summaries, assessments and
  company research.

## Build and package

```sh
bun install
node apps/desktop/scripts/build.mjs
(bun --cwd apps/desktop run package) # AppImage
# or: bun --cwd apps/desktop run package:dir
```

`apps/desktop/scripts/build.mjs` builds the web app, bundles the backend and
data CLI for Node, runs the crawler TypeScript build, installs crawler
production dependencies, stages Playwright Chromium, and compiles the Electron
main/preload scripts. electron-builder packages:

- `web/` built assets,
- `backend/` bundle, migrations and PGlite assets,
- `crawler/` build and production dependencies,
- `playwright/` Chromium and headless shell,
- `app.asar` containing the Electron main/preload scripts.

Artifacts:

- `apps/desktop/release/Surface-0.1.0-x86_64.AppImage`
- `apps/desktop/release/linux-unpacked/surface`

The packaged application does not need Bun, a Vite dev server, PostgreSQL, or
the backend/web/crawler Compose services at runtime.

## Run

```sh
./apps/desktop/release/Surface-0.1.0-x86_64.AppImage
```

On a headless test host, use Xvfb and Chromium's `--no-sandbox` only for the
test process:

```sh
xvfb-run -a ./Surface-0.1.0-x86_64.AppImage --no-sandbox
```

The app binds backend, crawler and its internal egress proxy to `127.0.0.1`
with OS-allocated ports. It uses a single-instance lock. A second launch focuses
the existing window instead of starting another backend.

### Data locations

Electron's `app.getPath("userData")` is used. On Linux this is normally
`~/.config/Surface/`:

- `pglite/` — embedded database,
- `data/snapshots/` — raw evidence,
- `data/company-logos/` — cached company symbols,
- `data/.surface-auth-secret` — local session signing key,
- `data/import-manifest.json` — written by a verified import,
- `settings.json` — SearXNG/OmniRoute settings,
- `logs/desktop.log`, `logs/backend.log`, `logs/crawler.log`.

`SURFACE_DESKTOP_USER_DATA=/path` overrides the user-data directory for testing
or an isolated profile. It is not needed for normal use.

### Settings and credentials

Settings → AI settings → Research and AI services lets you set:

- SearXNG URL,
- OmniRoute base URL, model and API key.

The API key is encrypted with Electron `safeStorage` when an OS keychain is
available. The app reports `os-encrypted`, `basic-text`, `plaintext`, or
`unavailable` so the actual protection is visible. The settings file is written
with mode `0600`. Saving applies the values to the running backend immediately;
restarting the app also reloads them.

The key is never returned to the renderer after saving. Database settings
(`analysis_settings`) are part of the database export. The service settings file
is not copied by the data migration because OS keychain entries are
machine-specific; re-enter the OmniRoute key after importing on a new machine.

### SearXNG

Start only SearXNG:

```sh
docker compose -f compose.searxng.yaml up -d
```

This Compose file has no PostgreSQL network dependency and never references the
production Compose project. Verify with:

```sh
curl 'http://127.0.0.1:8080/search?q=surface&format=json'
```

Without SearXNG, jobs, monitoring, snapshots, company research from saved
sources, and AI operations that do not request web search continue to work.
`search_web` returns:

> Cannot reach SearXNG. Start the search service and check SEARXNG_BASE_URL.

The desktop diagnostics panel shows the same service error. With SearXNG
running, the same search tool returns JSON results.

### Quitting

Closing the window quits the app. The backend stops accepting requests, stops
the executor after its current tick (bounded wait), removes its lease, closes
PGlite cleanly, and the crawler is terminated. Monitoring therefore stops while
Surface is closed; it resumes on the next launch. A tray icon, close-to-tray,
and autostart are intentionally not included in this version.

## Data migration

The desktop import format is Surface's own manifest + compressed JSONL export,
not `pg_dump`. Arbitrary PostgreSQL dumps are not assumed to match PGlite or
these migrations.

### 1. Export from the existing database

Run in the existing checkout while the source database is available. This is a
read-only operation. `DATA_DIR` must contain the source snapshots and company
logos.

```sh
cd apps/backend
node --import tsx scripts/desktop-data.ts export \
  --output /secure/surface-desktop-export \
  --database-url "$PRODUCTION_DATABASE_URL" \
  --data-dir /path/to/source/data
```

The command refuses an existing non-empty output directory, verifies every
referenced active snapshot content hash and referenced company logo, copies the
assets, and writes `manifest.json`. It never migrates or deletes the source.

### 2. Import into a fresh desktop profile

```sh
./Surface-0.1.0-x86_64.AppImage --surface-data import \
  --input /secure/surface-desktop-export
```

Or from the repository without Electron:

```sh
cd apps/backend
node --import tsx scripts/desktop-data.ts import \
  --input /secure/surface-desktop-export \
  --user-data ~/.config/Surface
```

Import refuses an existing `pglite/` database and a non-empty `data/` directory.
It stages the whole import in a sibling directory, applies all current Drizzle
migrations, inserts in foreign-key order, resets sequences, and verifies:

- every export file checksum,
- every destination table and column type,
- row counts and per-table content SHA-256,
- a representative record hash per table,
- `analysis_settings`,
- snapshot links and content hashes,
- company logo links,
- the copied session signing key checksum.

Only after all checks pass are `pglite/` and `data/` moved into the profile. A
failed import leaves the original profile untouched and the staged attempt
available for inspection.

Verify the import immediately, before launching the app:

```sh
./Surface-0.1.0-x86_64.AppImage --surface-data verify \
  --input /secure/surface-desktop-export
```

The check compares content hashes with the export. Once Surface has run,
monitoring may add jobs, the executor lease changes, and settings can be edited,
so a later comparison is expected to differ even though the migration was
correct.

### 3. Keep the rollback path

Keep the original database, its filesystem assets, and a database dump until
the desktop install has been used and checked. Import never deletes them. To
roll back, stop Surface, move the desktop profile's `pglite/` and `data/`
directories aside (do not delete them), then restore the original services and
data from the existing deployment.

## Packaging verification

`bun run`/Node build checks:

```sh
bun --cwd apps/backend check-types
bun --cwd apps/web check-types
bun --cwd apps/desktop check-types
node apps/desktop/scripts/build.mjs
```

The smoke test used during implementation sets `SURFACE_DESKTOP_SMOKE_TEST=1`.
The app starts both workers, checks `/api/health`, authenticated `/api/jobs`,
`/api/research` and `/api/desktop/status`, saves a test key through the
preload/IPC bridge, and exits. See `docs/desktop-migration.md` for the recorded
results.
