# Changelog

## desktop-v0.2.0 - 20 Nov 2026

### Added

- Lead discovery: a Find Leads workspace that searches configured sources,
  keeps a local review queue, and hands accepted leads to the company tracker.
  Discovery can be hardened with a rendered-page fallback when plain requests
  are blocked.
- Local SearXNG meta-search. `bun run searxng:start` / `searxng:stop` run a
  bundled Docker Compose stack on loopback, and the Find Leads settings point
  discovery at it. Requests to non-loopback SearXNG hosts are rejected.
- An AI writing assistant with a per-conversation resume and job context, plus
  a Gmail draft handoff. Generated emails open as Gmail drafts in the browser
  instead of being sent automatically, and Gmail settings live in desktop
  settings with a reconnect flow.
- Desktop metadata generation (`scripts/build-metadata.mjs`) writes
  `BUILD-INFO.json` and `SHA256SUMS` next to staged installers for CI, the
  development channel, and production releases.

### Changed

- Merge company tags into company statuses so tracker entries carry one
  status instead of parallel tag records.
- Store desktop app data in the platform user-data directory and slim the
  desktop packaging back to the tracker and profile surfaces, with
  `electron-builder` producing the AppImage and Debian package directly.
- Update the desktop CI, development build, and release workflows for the new
  packaging: source checks are formatting, lint, and type-check only, and
  release notes come from the matching `CHANGELOG.md` entry.

## desktop-v0.1.0 - 17 Nov 2026

First Linux desktop release. Surface now ships as an Electron application for
Ubuntu with a local SQLite database, the existing workspace, and a local
Playwright crawler.

### Added

- Install Surface as an Ubuntu AppImage or Debian package. The desktop shell
  starts its own backend and crawler on loopback, keeps data in a local SQLite
  database, and stores the OpenCode Go key through the OS keychain with an
  explicit plaintext fallback.
- A frameless Ubuntu title bar with minimize, maximize/restore, and close
  controls, plus `Ctrl+=` / `Ctrl+-` zoom and `Ctrl+0` reset.
- A separate Surface Dev channel for testing. It has its own product name, app
  id, executable, desktop entry, Debian package, user-data directory, database,
  settings, logs, keyring entries, child-process names, `DEV` badge, and window
  title, so development and production never share state.
- Development builds can include a production-data seed snapshot. It is applied
  once to a new Surface Dev profile and never replaces an existing database.
- GitHub Actions workflows for Linux CI, development builds on push, manual
  dispatch, or pull-request label, and tag-driven production releases.
  Development installers are separate unarchived artifacts; production
  installers are release assets.
- Reviewed release notes from `CHANGELOG.md`, plus `BUILD-INFO.json` and
  `SHA256SUMS` for published artifacts.
- OpenCode Go AI provider support through the AI SDK, with typed structured
  output for assessments, resume extraction, and company matching, streamed job
  summaries, and a bounded research tool loop.

### Changed

- Replace the desktop PostgreSQL requirement with a fresh local SQLite profile.
  Existing PostgreSQL data is not imported or modified; the web deployment
  keeps PostgreSQL.
- Move AI calls to a shared SDK layer with request admission, normalized errors,
  timeouts, abort handling, and bounded provider transport.
- Rename desktop settings to a v2 format with a v1 backup, separate OpenCode Go
  provider, base URL, model, and key fields, and provider-aware diagnostics.
- Research now uses a bounded `ToolLoopAgent` with search and crawl tools,
  citation repair, and a separate link-verification pass.

### Fixed

- Make the custom title bar controls clickable by carving a no-drag hole in the
  draggable header instead of letting clicks start a window drag.
- Keep the packaged AppImage smoke test working on a fresh profile by checking
  the window controls and either title bar, and verify the development tag and
  window title.

### Security

- Keep the renderer sandboxed with context isolation and no Node integration.
- Validate desktop IPC senders, keep the backend on loopback with a per-launch
  bearer token, and keep credentials out of URLs, logs, and process arguments.
