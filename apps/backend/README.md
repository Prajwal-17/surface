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
- `AUTH_EMAIL` — optional allowed login email; otherwise the saved profile email is used
- `AUTH_SECRET` — optional session signing key; when omitted, a private key is saved in `DATA_DIR`
- `AUTH_COOKIE_SECURE` — set to `true` when serving over HTTPS
- `SOURCE_TIMEOUT_MS` — timeout per upstream feed, defaults to `12000`

`bun run dev` explicitly starts with `APP_ENV=development`; `bun run start` uses
`APP_ENV=production`. This keeps local development records, backups, snapshots and
session keys in separate directories by default. In development, any valid email is
accepted only when no `AUTH_EMAIL` or profile email is configured. Production
requires one of those owner email values before it can issue a login session.

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

`bun run verify:sqlite` checks a temporary on-disk profile, including migration,
CRUD, and reopen. `bun run test` runs each suite against its own in-memory
SQLite database and temporary asset directory.
