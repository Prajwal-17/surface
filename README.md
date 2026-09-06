# Fieldwork

Fieldwork is a local-first job-discovery inbox. The V1 searches five public job
feeds, normalizes and deduplicates their listings, and lets you save or dismiss
roles without creating an account.

## Stack

- Next.js App Router, Tailwind CSS, shadcn-style UI, and TanStack Query
- Hono on Bun with module-oriented backend boundaries
- SQLite with Drizzle ORM and committed migrations
- Turborepo workspaces with shared UI and Zod API contracts

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
  web/       Next.js interface organized by product feature
  backend/   Hono API organized by backend domain module
packages/
  contracts/ Shared Zod schemas and API types
  ui/        Shared shadcn-style primitives
data/        Local SQLite runtime data
```
