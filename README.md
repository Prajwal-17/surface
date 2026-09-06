# Fieldwork

Fieldwork is a local-first job-discovery inbox. It searches five public job
feeds, normalizes and deduplicates their listings, remembers your job
preferences, and can rank inbox roles with a locally hosted OmniRoute gateway.

## Stack

- Next.js App Router, Tailwind CSS, shadcn/ui, and TanStack Query
- Hono on Bun with module-oriented backend boundaries
- SQLite with Drizzle ORM and committed migrations
- Turborepo workspaces with frontend-owned UI and backend-owned Zod API contracts

## Start locally

Requirements: Bun 1.3+.

```bash
bun install
bun run db:migrate
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The backend listens on
[http://localhost:4000](http://localhost:4000), and Next.js proxies browser API
requests to it.

The SQLite database is created at `data/job-search.sqlite` and is ignored by
Git.

## Job-fit assistant

Run [OmniRoute](https://github.com/lcrsx/omniroute) locally, create an endpoint
key in its dashboard, and add these values to `apps/backend/.env`:

```bash
OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1
OMNIROUTE_API_KEY=your-local-endpoint-key
OMNIROUTE_MODEL=auto
```

Set your preferences in Fieldwork, then use **Analyze next 10** in the Inbox.
Each job is scored separately and successful results are saved even if another
job fails. Saving updated preferences clears earlier scores so the next run uses
the new guidance.

Preferences and assessments are stored only in the local SQLite database.
OmniRoute memory is disabled for these requests, but prompts may be sent to any
cloud model you connect to OmniRoute.

## Useful commands

```bash
bun run dev          # Start web and backend
bun run build        # Production build
bun run check-types  # TypeScript validation
bun run lint         # ESLint validation
bun run db:generate  # Generate a migration after schema changes
bun run db:migrate   # Apply committed migrations
bun run db:studio    # Open Drizzle Studio
```

## V1 sources

- Remotive
- Jobicy
- Arbeitnow
- RemoteOK
- We Work Remotely

Each source is isolated behind an adapter. A failed feed is reported without
discarding results from the other feeds.

## Workspace layout

```text
apps/
  web/       Next.js interface; shadcn/ui components in src/components/ui
  backend/   Hono API; browser-safe schemas in src/shared/contracts.ts
packages/
  eslint-config/      Shared lint configuration
  typescript-config/  Shared TypeScript configuration
data/        Local SQLite runtime data
```

The frontend imports API schemas through `backend/contracts`, the backend's only
package export. That module contains Zod schemas and constants, with no server or
database imports. UI components belong to the frontend and are imported from
`@/components/ui/*`.

See [design.md](design.md) for the dark theme, typography, component conventions,
accessibility requirements, and shadcn maintenance workflow.
