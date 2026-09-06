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
- `PATCH /api/jobs/:id/status`
- `GET /api/health`
