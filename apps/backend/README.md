# Surface backend

The backend is a Bun/Hono API with domain modules for discovery and jobs.

## Structure

```text
src/
├── app.ts                  # Hono composition root
├── index.ts                # Bun server entry point
├── config/                 # Environment configuration
├── infrastructure/
│   └── database/           # SQLite driver, Drizzle schema and migrations
├── modules/
│   ├── discovery/          # Routes, service, repository, tables, sources
│   └── jobs/               # Routes, service, repository, and tables
└── shared/
    ├── errors/
    ├── http/
    └── normalization/
```

Browser-safe API schemas and inferred types live in `packages/contracts` and are
imported through `@surface/contracts`.

Each module exposes its public API through its own `index.ts`. Cross-module
imports use those entry points rather than reaching into module internals.

```bash
bun install
bun --cwd apps/backend dev
```

Environment variables:

- `PORT` — API port, defaults to `4000`
- `APP_ENV` — `development`, `production` or `test`; selects the default data directory
- `SQLITE_DATABASE_FILE` — SQLite path, defaults to `surface.sqlite3` inside `DATA_DIR`
- `SQLITE_MIGRATIONS_DIR` — SQLite migration folder; the desktop launcher points at the packaged `drizzle-sqlite/`
- `DATA_DIR` — filesystem snapshots and signing key; defaults to `data/` in production, `data/development/` in development
- `AUTH_SECRET` — optional session signing key; when omitted, a private key is saved in `DATA_DIR`
- `AUTH_COOKIE_SECURE` — set to `true` when serving over HTTPS
- `SOURCE_TIMEOUT_MS` — timeout per upstream feed, defaults to `12000`

`bun run dev` explicitly starts with `APP_ENV=development`; `bun run start` uses
`APP_ENV=production`. This keeps local development records, backups, snapshots and
session keys in separate directories by default. Any valid email opens the
workspace; there is no owner-email allowlist.

Routes:

- `POST /api/discovery/search`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/analyze`
- `PATCH /api/jobs/:id/status`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/health`

Job-fit analysis uses the Vercel AI SDK with the OpenCode Go provider. Configure:

- `AI_PROVIDER` — only `opencode-go` is supported
- `AI_BASE_URL` — defaults to `https://opencode.ai/inference/go/openai/v1`
- `AI_MODEL` — defaults to `deepseek-v4.1-flash`
- `AI_REASONING` — optional reasoning effort: `default`, `low`, `medium`, or `high` (model support varies)
- `OPENCODE_GO_API_KEY` — your OpenCode Go key

The old `OMNIROUTE_*` variables are ignored for inference. Surface warns once at
startup if they are set; it never sends the old key to OpenCode.

## API schemas

`@surface/contracts` is the workspace package for browser-safe API schemas,
constants, and inferred types shared by the backend and frontend. Keep server
modules, Bun APIs, database clients, and environment configuration out of it.

## Database migrations and tests

`bun run db:generate` generates changes for the shared SQLite schema in
`src/infrastructure/database/schema.ts` and writes them to `drizzle-sqlite/`.
The backend applies these migrations on startup. Set `SQLITE_DATABASE_FILE`
to apply them directly with `bun run db:migrate`.

`bun run db:studio` opens Drizzle Studio against the development desktop
profile (`~/.config/Surface Dev/surface.sqlite3`), the same file the desktop app
uses. `bun run db:studio:prod` opens the production desktop profile
(`~/.config/Surface/surface.sqlite3`). Both follow `XDG_CONFIG_HOME` and
`SURFACE_DESKTOP_USER_DATA`, and `SQLITE_DATABASE_FILE` overrides the file
entirely. These commands never use the repository `data/` directory. Pass
`--port <port>` to override the default port.

Studio creates the SQLite file when it does not exist yet, so launch the
matching desktop channel once first if you only want an existing database.

`bun run db:reset-dev` clears collected data from the development desktop
profile. It keeps profile, preferences, settings, configured sources and
tracker data, and deletes jobs, companies, applications, collected evidence,
runs, queues and the cached snapshot and logo files. Migrations and the schema
stay intact. Review the preflight report first, then apply:

```sh
bun run db:reset-dev
CONFIRM_DEV_DATA_RESET=1 bun run db:reset-dev -- --apply
```

The reset writes a `surface.sqlite3.before-dev-data-reset-<timestamp>.sqlite3`
backup next to the database and refuses to run while the backend holds its
worker lease or when `APP_ENV=production`.

`bun run db:import-notion` copies the Notion Companies and Applications
databases into the tracker tables of the development desktop profile. It needs
a Notion integration token in `NOTION_TOKEN`, shared with both databases.
Notion page ids become tracker ids, so re-running updates rows instead of
duplicating them. Review the preflight report first, then apply:

```sh
NOTION_TOKEN=ntn_... bun run db:import-notion
NOTION_TOKEN=ntn_... bun run db:import-notion -- --apply
```

Add `--replace` with `CONFIRM_TRACKER_IMPORT=1` to delete existing tracker rows
first. Company size, tags and application channels are kept in the notes field
because the tracker has no dedicated columns for them.

`bun run verify:sqlite` checks a temporary on-disk profile, including migration,
CRUD, and reopen. `bun run test` runs each suite against its own in-memory
SQLite database and temporary asset directory.
