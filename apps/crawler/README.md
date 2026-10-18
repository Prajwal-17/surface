# Company research crawler

A Node.js service using Crawlee. Source is strict TypeScript; development runs it
with Node 24's native TypeScript support, and Docker runs compiled JavaScript.

## Code map

- `src/index.ts` — start the HTTP service and private egress proxy; shut down both.
- `src/server/` — HTTP routes, request validation, cancellation, and FIFO crawl slots.
- `src/crawl/crawl-page.ts` — validate the target, check robots.txt, try HTML, then render if needed.
- `src/crawl/runners.ts` — Cheerio and Playwright execution with shared cleanup.
- `src/crawl/browser.ts` — browser request restrictions.
- `src/crawl/extract.ts` — readable text and deduplicated links.
- `src/crawl/robots.ts` — robots.txt policy.
- `src/network/` — public destination validation, DNS pinning, bounded robots requests,
  and the HTTP/CONNECT proxy used by both crawlers.
- `src/types.ts` — request and result shapes.

The network checks apply at connection time, including browser subrequests. Keep
that boundary in place when adding crawl strategies.

## Commands

From this directory, after `bun install` at the repository root:

```sh
bun run dev          # Node 24, watches TypeScript source
bun run check-types  # strict TypeScript check
bun run test         # destination, cancellation, and concurrency regressions
bun run build        # compile into dist/
bun run start        # run compiled output
```

Install Chromium for local development with `bun x playwright install chromium`,
or use `docker compose up -d --build crawler` from the repository root.

The HTTP contract remains `GET /health`, `POST /crawl` with `{ id, url, render? }`,
and `POST /crawl/:id/cancel`. Port 4100 binds to loopback by default.
