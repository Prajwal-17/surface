# Fieldwork backend

The backend is a Bun/Hono API with domain modules for discovery and jobs.

## Structure

```text
src/
├── app.ts                  # Hono composition root
├── index.ts                # Bun server entry point
├── config/                 # Environment configuration
├── infrastructure/
│   └── database/           # SQLite, Drizzle schema, and migrations
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
bun run db:migrate
bun run dev
```

Environment variables:

- `PORT` — API port, defaults to `4000`
- `DB_FILE_NAME` — SQLite file path, defaults to the repository `data/` folder
- `SOURCE_TIMEOUT_MS` — timeout per upstream feed, defaults to `12000`

Routes:

- `POST /api/discovery/search`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/analyze`
- `PATCH /api/jobs/:id/status`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/health`

Job-fit analysis uses an OpenAI-compatible OmniRoute endpoint. Configure:

- `OMNIROUTE_BASE_URL` — defaults to `http://127.0.0.1:20128/v1`
- `OMNIROUTE_API_KEY` — local endpoint key created by OmniRoute
- `OMNIROUTE_MODEL` — defaults to OmniRoute's `auto` route

## API schemas

`@surface/contracts` is the workspace package for browser-safe API schemas,
constants, and inferred types shared by the backend and frontend. Keep server
modules, Bun APIs, database clients, and environment configuration out of it.
