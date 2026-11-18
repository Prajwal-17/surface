# Surface desktop

Surface runs as one personal **Ubuntu Linux** desktop app. Electron starts a
local Node backend with SQLite. Hono serves the React renderer on a loopback
port. Browser research and SearXNG are optional.

Open the development app with `bun dev` from the repository root. The launcher
builds the renderer and backend before opening the Surface Dev window. Re-run
the command to pick up source changes.

On Ubuntu hosts that require a setuid Chromium sandbox, the launcher can use an
installed Chromium or Google Chrome sandbox helper. The helper must be
root-owned with mode `4755`.

## Requirements

- Ubuntu Linux x86_64 for the AppImage and `.deb`. The build host needs Node 24
  and Bun for the repository build scripts. macOS, Windows and Linux ARM are
  not supported.
- Electron 45 bundles Node 24 with `node:sqlite`; there is no native SQLite
  addon to rebuild or stage.
- Optional: Docker for SearXNG.
- Optional: an OpenCode Go API key for AI summaries, assessments and
  company research.

## Build and package

```sh
bun install
bun --cwd apps/desktop package       # AppImage + .deb for Ubuntu
bun --cwd apps/desktop package:appimage
bun --cwd apps/desktop package:deb
bun --cwd apps/desktop package:dir   # unpacked only
```

`apps/desktop/scripts/build.mjs` builds the web app, bundles the backend for
Node, runs the crawler TypeScript build, installs crawler production
dependencies, stages Playwright Chromium, and compiles the Electron
main/preload scripts. electron-builder packages:

- `web/` built assets,
- `backend/` bundle, SQLite migrations and bundled locations data,
- `crawler/` build and production dependencies,
- `playwright/` Chromium and headless shell,
- `app.asar` containing the Electron main/preload scripts,
- `resources/icon.png` for the AppImage, `.deb` desktop entry and window icon.

Artifacts:

- `apps/desktop/release/Surface-0.1.0-x86_64.AppImage`
- `apps/desktop/release/Surface-0.1.0-amd64.deb`
- `apps/desktop/release/linux-unpacked/surface`

The packaged application does not need Bun, a Vite dev server or
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

### Custom Ubuntu title bar

The native window frame and application menu are removed. Surface draws its own
44px title bar:

- the existing workspace header (and the onboarding header) is the draggable
  region; links, buttons, inputs and page actions are explicit no-drag islands,
- minimize, maximize/restore and close controls sit at the top right on every
  route, including sign-in, session checks and onboarding,
- the maximize/restore button reflects live window state from Electron and uses
  accessible labels plus `aria-pressed`,
- `Ctrl+=` zooms in, `Ctrl+-` zooms out, and `Ctrl+0` resets the page zoom;
  `F11` toggles fullscreen, `Alt+F9` minimizes, `Alt+F10` maximizes/restores,
  and the caption buttons work with Tab, Enter and Space,
- all IPC is validated against the main window, its main frame and the backend
  origin. The renderer remains sandboxed with context isolation and no Node
  integration.

The `DEV` environment badge is rendered when Vite's development flag is set
(`import.meta.env.DEV`) or when the packaged app reports the `development`
channel. A packaged development build therefore shows a `Surface Dev` brand
plus a `DEV` pill in the sidebar and a floating `DEV` marker, and its window
title is `Surface Dev — Your career workspace`. Production builds render no
environment badge.

Development and production are separate applications, not two modes of the same
install:

- development: product `Surface Dev`, executable `surface-dev`, app id
  `dev.surface.desktop.dev`, desktop file `surface-dev.desktop`, Debian package
  `surface-dev`, child process names `surface-dev-backend` and
  `surface-dev-crawler`;
- production: product `Surface`, executable `surface`, app id
  `dev.surface.desktop`, desktop file `surface.desktop`, Debian package
  `surface`, child process names `surface-backend` and `surface-crawler`.

They use different `userData` directories, databases, settings, logs, session
cookies, keyring entries, desktop entries, and Installer identities, so both can
run and be installed at the same time.

### Data locations

Electron's `app.getPath("userData")` is used. On Linux this is normally
`~/.config/Surface/` for production and `~/.config/Surface Dev/` for the
development channel:

- `surface.sqlite3` — SQLite database (WAL mode),
- `surface.sqlite3-wal`, `surface.sqlite3-shm` — SQLite journal files while open,
- `data/snapshots/` — raw evidence,
- `data/company-logos/` — cached company symbols,
- `data/.surface-auth-secret` — local session signing key,
- `settings.json` — version-2 SearXNG/OpenCode Go settings (with a
  `settings.json.v1.backup.json` copy when upgrading version 1),
- `logs/desktop.log`, `logs/backend.log`, `logs/crawler.log`.

`SURFACE_DESKTOP_USER_DATA=/path` overrides the user-data directory for testing
or an isolated profile. It is not needed for normal use.

### Profile backup and restore

Quit Surface before taking a backup so no process holds the database or assets.
Copy the whole profile directory (`~/.config/Surface Dev`):

```sh
profile="${XDG_CONFIG_HOME:-$HOME/.config}/Surface Dev"
backup="$(mktemp -d)"
cp -a "$profile/." "$backup/"
```

The copy contains `surface.sqlite3` with committed WAL data, `data/`, and
`settings.json`; keep it private because it includes local settings and
authentication data. To restore, copy the backup into a new directory and open
it as the user-data directory:

```sh
restore="$(mktemp -d)"
cp -a "$backup/." "$restore/"
SURFACE_DESKTOP_USER_DATA="$restore" apps/desktop/release/dev/linux-unpacked/surface-dev
```

### Settings and credentials

Settings → AI settings → Research and AI services lets you set:

- SearXNG URL,
- AI provider (`opencode-go`), base URL, model and OpenCode Go API key.

The API key is encrypted with Electron `safeStorage` when an OS keychain is
available. The app reports `os-encrypted`, `basic-text`, `plaintext`, or
`unavailable` so the actual protection is visible. The settings file is written
with mode `0600`. Saving applies the values to the running backend immediately;
restarting the app also reloads them.

The key is never returned to the renderer after saving. Service settings are
stored separately from `surface.sqlite3`; they are not part of any database
transfer. Re-enter the OpenCode Go key when setting up a new machine.

Version-1 desktop settings stored an OmniRoute URL, model and key. On first load
Surface backs up that file, moves the old credentials into a legacy section that
is never used for AI calls, and starts with the OpenCode Go defaults and no key.
Enter a separate OpenCode Go key in Settings. The old encrypted value remains in
`settings.json` only as legacy data.

### SearXNG

Start only SearXNG:

```sh
docker compose -f compose.searxng.yaml up -d
```

Verify the optional search service with:

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
SQLite cleanly (checkpointing WAL), and the crawler is terminated. Monitoring
therefore stops while Surface is closed; it resumes on the next launch. A tray
icon, close-to-tray, and autostart are intentionally not included in this
version.

## Storage implementation

- SQLite is opened with `journal_mode=WAL`, `foreign_keys=ON`,
  `busy_timeout=5000`, and `synchronous=NORMAL`.
- All writes run on one embedded connection. Transactions start with
  `BEGIN IMMEDIATE`; SQLite statements are serialized so reads cannot observe a
  half-finished transaction.
- The shared SQLite migration folder is `apps/backend/drizzle-sqlite/`.
- JSON values are stored as SQLite `text` with Drizzle JSON mapping; booleans
  use SQLite integer `0/1`; timestamps remain ISO text so existing application
  comparisons stay stable.
- Foreign keys, unique indexes, partial indexes for active work and research
  runs, and the executor lease are enforced in SQLite. FTS5 is not enabled:
  current search is literal substring matching and changing that would change
  result semantics; normal indexes cover the existing equality and ordering
  paths.

## Packaging verification

`bun run`/Node build checks:

```sh
bun --cwd apps/backend check-types
bun --cwd apps/web check-types
bun --cwd apps/desktop check-types
node apps/desktop/scripts/build.mjs
```

Both the AppImage and Debian package are built from the same staged
`linux-unpacked` tree. The `.deb` installs under `/opt/Surface`, with a
`/usr/share/applications/surface.desktop` entry and a hicolor icon. It is
unsigned; Ubuntu may ask for confirmation when installing a local `.deb`.

The SQLite integration check uses a new temporary profile and never opens an
existing desktop database:

```sh
bun run verify:sqlite
```

The smoke test used during implementation sets `SURFACE_DESKTOP_SMOKE_TEST=1`.
The app starts both workers, checks `/api/health`, authenticated `/api/jobs`,
`/api/research`, `/api/schema` and `/api/desktop/status`, saves a test key
through the preload/IPC bridge, and exits.
