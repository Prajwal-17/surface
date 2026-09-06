# Fieldwork web

The frontend is a Next.js App Router application organized by feature under the
framework-supported `src/` directory.

```text
src/
├── app/                    # Routes, root layout, providers, and global CSS
├── components/             # Shared layout and feedback components
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
