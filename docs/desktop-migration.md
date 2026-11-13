# Desktop verification

This report records the SQLite desktop implementation, its custom Ubuntu window
chrome, and what was actually run on the Linux build host. The production
PostgreSQL deployment, its containers, volumes, snapshots, backups, and
historical migrations were not started, stopped, reconfigured, imported,
exported, or otherwise modified. No production database was accessed and no
backup restore was performed.

## Scope

- Electron runs the local Node backend and Crawlee/Playwright crawler on
  loopback, OS-allocated ports with an app-owned session token.
- The backend stores data in a real SQLite file through Node's built-in
  `node:sqlite` driver. PGlite is removed from the desktop path and the backend
  dependency tree.
- The React renderer remains `apps/web`, built independently and served from
  packaged assets by Hono.
- SQLite uses a from-scratch Drizzle baseline in
  `apps/backend/drizzle-sqlite/`. PostgreSQL's `apps/backend/drizzle/` history is
  unchanged and still serves the deployed web path.
- There is no export, import, conversion, or automatic migration from PGlite,
  SQLite backups, or PostgreSQL. The former `--surface-data
export|import|verify` command and bundled data CLI are removed.
- A new profile uses `<Electron userData>/surface.sqlite3`. A previous `pglite/`
  directory is logged as ignored and is never opened, migrated, overwritten, or
  deleted.
- Supported desktop host/target is Ubuntu Linux x86_64 only. macOS and Windows
  packaging are not configured.

## Milestone commits

- `a40098c` — real SQLite driver, dual-dialect schema, fresh migrations,
  dialect-correct SQL, serialized transactions and verification script.
- `67db07c` — Electron packaging on SQLite, removal of PGlite/export/import,
  desktop documentation.
- `e0d15cd` — frameless Ubuntu title bar, validated window IPC, custom icon,
  AppImage + Debian packaging, and development-only environment badge.
- `02783dd` through `fd966a6` — Ubuntu desktop CI, release helper, and release
  documentation owned by the build/release agent.

## Build and static checks

Commands run from the repository root:

```sh
bun install
bun run format:check
bun run lint
bun run check-types
bun run build
bun run verify:sqlite
```

Results:

- All 6 workspace formatting checks passed.
- All 6 workspace lint tasks passed with 0 warnings and 0 errors.
- All 6 workspace type checks passed.
- The Turbo build completed, including the desktop asset build.
- `bun install` removed `@electric-sql/pglite` from the lockfile and dependency
  tree.

## Fresh SQLite integration check

Command:

```sh
bun run verify:sqlite
```

The script creates a new temporary profile, refuses to reuse an existing
`surface.sqlite3`, sets `SQLITE_DATABASE_FILE` and `SQLITE_MIGRATIONS_DIR`, and
never opens an existing desktop profile.

Recorded checks:

- 32 application tables were created by 1 SQLite migration.
- 34 foreign keys were present.
- Nested JSON profile context, arrays, numbers, nulls and booleans round-tripped.
- Analysis settings persisted `enabled`/`paused` as SQLite integer booleans.
- Company and configured source rows inserted.
- A content-addressed snapshot file was written and linked from an observation.
- Jobs were inserted through `upsertCandidates`, then listed with
  case-insensitive search, read in detail, and status was updated.
- A collection run and queued work item were created; a running item was marked
  interrupted and the run state synchronized on recovery.
- Executor lease and coordination-lock rows persisted.
- Duplicate job keys, duplicate active work identities and foreign-key
  violations were rejected by SQLite constraints.
- A transaction that threw rolled back its insert.
- Company discovery search, queue counts, contacts, actions and JSON payload
  lookup worked.
- Research runs, sources, auto-increment event IDs, reports, messages with
  boolean flags, link reviews and interrupted-run recovery worked.
- The workspace revision query returned the expected counters.
- Assessment and observation rows were inserted with their foreign keys.
- After closing the app database, a new Node process reopened the same file and
  found the saved job, profile revision, research run, work items and migration
  record.
- `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned no
  rows.

Evidence:

- `data/desktop-verification/sqlite/verification.log`
- `data/desktop-verification/sqlite/verification.json`

The temporary profiles used for these checks were created under `/tmp/opencode/`
and were not copied into the repository.

## Frameless Ubuntu window chrome

The native frame and application menu are removed. Main-process checks:

- `BrowserWindow` uses `frame: false` and `Menu.setApplicationMenu(null)`.
- `minimize`, `maximize/restore`, and `close` use validated IPC handlers.
- Sender validation requires the exact main `webContents`, the main frame, and
  the backend origin.
- Renderer preferences keep `nodeIntegration: false`, `contextIsolation: true`,
  `sandbox: true`, and a narrow preload surface.
- Window state is published on maximize, unmaximize, fullscreen changes, focus
  and blur.

Packaged smoke result:

- `.desktop-window-controls button` count: 3.
- `aria-label` values: `Minimize window`, `Maximize window`, `Close window`.
- The workspace header computed `-webkit-app-region: drag`.
- Maximize changed state from `maximized:false` to `maximized:true`; a second
  toggle restored `maximized:false`.
- `F11`, `Alt+F9` and `Alt+F10` are handled in the main process; caption
  buttons use native keyboard focus and activation.

Development-only environment badge:

- A Playwright check of the Vite development server found the `DEV` badge,
  `aria-label="Development mode"`.
- A production Vite preview and the packaged AppImage/deb reported
  `environmentTag: false`; the production UI has no `DEV` or `PROD` badge.
- The first Tab focus lands on the minimize caption button, confirming keyboard
  order.

Visual evidence:

- `data/desktop-verification/sqlite/titlebar-workspace.png`
- `data/desktop-verification/sqlite/titlebar-onboarding.png`

## Packaged artifacts

| Artifact                        | Size (bytes) | SHA-256                                                            |
| ------------------------------- | -----------: | ------------------------------------------------------------------ |
| `Surface-0.1.0-x86_64.AppImage` |  398,969,833 | `c326b3ae2284328630ec669f041a7ff342067670a2b3f61f60a4d36862be70ff` |
| `Surface-0.1.0-amd64.deb`       |  336,019,520 | `77eee64139cfc2113faf1cb1368488ebc628c0eb1bd22d315985e5a553d488b7` |

Both are written to `apps/desktop/release`. The canonical command
`bun --cwd apps/desktop package` builds both in one run from the same staged
`linux-unpacked` tree. It uses no publish configuration, no GH_TOKEN, and no
upload step.

The packaged resources contain:

- `backend/index.mjs`, `backend/drizzle-sqlite/`, and locations data,
- the `apps/web` built assets,
- the crawler build and production dependencies,
- Playwright Chromium/headless shell and FFmpeg,
- `icon.png` and no PGlite package or data CLI.

### AppImage runs

Recorded under Xvfb with `--no-sandbox` for the test process only:

- Fresh profile with `SURFACE_DESKTOP_SMOKE_TEST=1`: backend and crawler became
  ready, `/api/health` reported `database: "sqlite"`, authenticated jobs and
  research endpoints responded, `/api/schema` returned 32 tables, settings were
  saved through preload/IPC, window state toggled correctly, and shutdown was
  clean.
- Same profile restarted: the SQLite file, migration record, settings and seeded
  job/research rows persisted, and a different backend port was allocated.
- Seeded profile from `verify:sqlite`: 1 job, 1 research company and 32 tables
  were served by the packaged app.
- Direct FUSE launch completed with exit code 0.
- `PATH=/usr/bin:/bin` launch (no Bun on `PATH`) completed with exit code 0.
- After every run, no Surface backend, crawler or Electron worker process
  remained.
- `settings.json` was mode `0600`; the test key was not present in plaintext.
- `PRAGMA integrity_check` returned `ok`.

### Debian package

- `dpkg-deb -I` reports package `surface`, version `0.1.0`, architecture `amd64`,
  maintainer and homepage metadata.
- The package installs `/opt/Surface/surface`,
  `/usr/share/applications/surface.desktop`, and the hicolor icon.
- The extracted package launched under Xvfb with a new profile; the smoke test
  returned 32 tables, three window controls, no environment badge, successful
  maximize/restore and clean shutdown.

Evidence:

- `data/desktop-verification/sqlite/appimage-fresh.log`
- `data/desktop-verification/sqlite/appimage-reopen.log`
- `data/desktop-verification/sqlite/appimage-no-bun.log`
- `data/desktop-verification/sqlite/deb-smoke.log`
- `data/desktop-verification/sqlite/checksums.txt`

## Storage details verified

- SQLite opens with `journal_mode=WAL`, `foreign_keys=ON`,
  `busy_timeout=5000`, and `synchronous=NORMAL`.
- All statements use one embedded connection. Mutations inside a transaction
  are serialized; transactions use `BEGIN IMMEDIATE`, and transaction-local
  statements bypass the outer queue because they are already inside it.
- PostgreSQL-only SQL was replaced with dialect-correct helpers or branches:
  `strpos`/`instr` substring search, `ILIKE`/`lower(...) LIKE`, integer casts,
  JSON key extraction, `NULL` JSON placeholders, and SQLite catalog PRAGMAs for
  `/api/schema`.
- PostgreSQL `FOR UPDATE` remains on the production database path. SQLite skips
  it because the immediate transaction owns the write lock.
- `research_events.id` uses SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`; lease
  expiry uses SQLite integer; JSON/boolean/date columns map to text/JSON,
  integer booleans and ISO text.
- FTS5 is intentionally not enabled: existing job search is literal substring
  matching, and switching to FTS would change result semantics. Equality,
  ordering, foreign-key, unique and partial indexes are present.

## Not verified / limitations

- No production PostgreSQL connection, container, database, dump, volume,
  snapshot or backup was touched. The deployed PostgreSQL path was validated by
  type-checking and its unchanged migrations only.
- Live SearXNG and live OmniRoute services were not available, so external
  search results and real model output were not exercised. Persistence and
  lifecycle paths were verified without claiming external service behavior.
- No live external job-board fetch was run from the packaged application; queue
  creation, work recovery and run coordination were verified locally.
- Both installers are unsigned. Ubuntu may warn when installing the local
  `.deb`. Tray, close-to-tray and autostart remain intentionally deferred.
- `safeStorage` protection depends on the Linux keyring. The build host reported
  `os-encrypted`; hosts without a keyring should treat settings as less
  protected and the UI reports the weaker mode.

## Safe fresh start

The app creates `surface.sqlite3` without reading an old `pglite/` directory.
To start over while preserving every previous file:

```sh
mv ~/.config/Surface ~/.config/Surface-before-sqlite
./Surface-0.1.0-x86_64.AppImage
```

Or use `SURFACE_DESKTOP_USER_DATA=/path/to/new-profile`. Do not delete the old
profile or production backups until the new desktop profile has been checked.
There is no import command that can copy old data into the new database.
