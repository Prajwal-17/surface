# Surface desktop migration

## Implementation handoff

Implement this plan in a new thread. Use **DeepSeek V4.1 Flash 1017**, with **max reasoning**, through OpenCode. The current model catalog supports provider `opencode`, model `opencode/deepseek-v4.1-flash`, and `target.options.variant: "max"`. Recheck availability in the implementation thread; if unavailable, report it without substituting another model. This document is planning only.

## Target

One personal Electron app starts the existing UI, a local backend with embedded PGlite, and the crawler. **Only SearXNG stays in Docker.** OmniRoute remains an external endpoint. Target the current Linux machine first.

## Steps

1. **Prove embedded database compatibility.** Test existing Drizzle migrations, raw SQL, transactions, advisory locks, recovery, and persistent reopen against PGlite in a temporary data directory. Adapt incompatible SQL or process coordination explicitly; do not assume complete PostgreSQL compatibility. Keep the existing production database untouched.
2. **Make the backend run under Node.** Replace Bun runtime APIs, audit runtime and build assumptions, serve the web build from Hono, and expose explicit startup/shutdown functions. Resolve packaged migration and asset paths explicitly. Store the database, snapshots, settings, and logs under Electron's `app.getPath("userData")`; require no external PostgreSQL for desktop startup.
3. **Add `apps/desktop`.** Electron launches backend and crawler utility processes, waits for readiness, and opens the UI. Bind services to loopback with allocated ports, acquire a single-instance lock, handle startup failures, and stop workers and flush the database on quit. Keep renderer Node integration off, context isolation and sandbox on, restrict navigation, and protect local APIs with an app-owned session/token instead of removing authentication globally.
4. **Connect settings and SearXNG.** Support SearXNG URL and OmniRoute URL/key/model settings, persisting credentials through OS-backed encryption where available. Add a standalone SearXNG-only Compose file with no PostgreSQL network dependency. Document its start command. Show a useful research error when SearXNG is unavailable while keeping other features usable.
5. **Package and verify.** Package with electron-builder, including web assets, backend/crawler dependencies, migrations, PGlite assets, and Playwright Chromium. Verify the actual Linux package runs without Bun, a development server, or non-SearXNG containers. Document that quitting stops monitoring; tray/autostart can follow separately.
6. **Migrate existing data safely.** Provide an explicit import command using a backup/export of the current database and a copy of snapshots. Validate the export/import format against PGlite first; do not assume an arbitrary `pg_dump` restores unchanged. Check row counts, representative records, settings, and snapshot links. Preserve the original database, files, and backup for rollback.

## Acceptance checks

- Fresh install launches with no external PostgreSQL or backend/web/crawler containers.
- Data survives restart; jobs, monitoring, snapshots, and company research work.
- Research works with SearXNG running and fails clearly with it stopped.
- Second launch, port conflicts, startup failure, and quit leave no orphan processes or corrupt data.
- Existing relevant checks pass; packaged-app smoke testing and migration verification are documented.

Complete each step with relevant verification before proceeding. Preserve the current deployment until the desktop build and data import have been verified; do not delete production data or volumes.
