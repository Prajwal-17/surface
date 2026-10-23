# Surface web

The frontend is a Vite single-page application. React Router owns route
configuration and URL state, while TanStack Query owns server data and cache state.

```text
src/
├── app/                    # Router setup and application bootstrap
│   └── routes/             # Route components and workspace layouts
├── features/               # Feature UI, API calls, and feature hooks
├── components/             # Shared layout, feedback, and UI components
├── lib/                    # API client, query client, keys, and utilities
├── assets/                 # Bundled assets such as local fonts
└── styles/                 # Global styles and theme tokens
```

## Development

Start the web and backend workspaces from the repository root:

```sh
bun run dev
```

The dev server opens [http://localhost:17000](http://localhost:17000) in the
default browser. The production preview uses port 17000 and also opens the
browser. Vite proxies `/api` to the backend at `http://localhost:4000` by
default. Set `BACKEND_URL` to use another backend URL. Shared imports use the
`@/` alias for `src/`.

## UI and API ownership

- `src/components/ui/` contains locally installed and customized shadcn/ui source.
- `components.json` maps the shadcn UI alias to `@/components/ui`.
- `src/lib/utils.ts` provides `cn` and date formatting.
- `@surface/contracts` supplies browser-safe Zod schemas and types shared with the API.
- [Design guide](../../design.md) documents the approved styling and component workflow.

Add a needed component from this directory with `bunx shadcn@latest add <component>`.
Review generated changes and preserve the local theme; do not overwrite customized
components without reviewing their diff.
