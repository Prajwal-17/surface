# Fieldwork backend

The backend is a Bun/Hono API with domain modules for discovery and jobs.

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
