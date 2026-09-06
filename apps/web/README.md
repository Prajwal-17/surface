# Fieldwork web

The frontend is a Next.js App Router application organized by feature under the
framework-supported `src/` directory.

```text
src/
├── app/                    # Routes, root layout, providers, and global CSS
├── components/             # Shared layout, feedback, and shadcn/ui components
├── features/
│   ├── discovery/          # Search UI, API call, schema, and mutation hook
│   └── jobs/               # Job UI, API calls, and query/mutation hooks
└── lib/                    # API client, query client, keys, and utilities
```

## Getting Started

Run the development server from the repository root:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The home route is `src/app/page.tsx`. Shared imports use the `@/` alias,
which resolves to `src/`.

## UI and API ownership

- `src/components/ui/` contains locally installed and customized shadcn/ui source.
- `components.json` maps the shadcn UI alias to `@/components/ui`.
- `src/lib/utils.ts` provides `cn` and date formatting.
- `backend/contracts` supplies the API's browser-safe Zod schemas and types.
- [Design guide](../../design.md) documents the approved styling and component workflow.

Add a needed component from this directory with `bunx shadcn@latest add <component>`.
Review generated changes and preserve the local dark theme; do not overwrite
customized components without reviewing their diff.
