# Surface

A local job-review workspace: what is worth reviewing, why it fits, and where to act.
Jobs, Companies, Activity and Profile share a Vite, React, React Router,
TanStack Query and shadcn interface backed by Hono, Bun, Drizzle and SQLite.
Turborepo coordinates builds and checks across the Bun workspaces. API contracts
and TypeScript presets are shared from `packages/`; company research uses bundled
SearXNG and Crawlee services, and application data stays in SQLite.

## Development

Use Bun 1.4.1 or newer and Node 24 or newer. Root scripts use Turborepo for
workspace task scheduling and caching. Oxlint and Prettier provide repository-wide
linting and formatting. Shared TypeScript presets live in
`packages/typescript-config`; browser-safe API contracts live in
`packages/contracts`.

```sh
bun install
bun run db:migrate
bun run dev
```

Open http://localhost:3000. Vite proxies `/api` to the backend on port 4000
during development. The Docker web server also proxies `/api` to the backend.
Use `BACKEND_URL` for a different backend. SQLite defaults to
`data/surface.sqlite`; raw content-addressed snapshots live beside it.
The backend performs monitoring and analysis while the browser is closed.
Run one backend executor per data directory.

The database starts from a generated baseline: `apps/backend/drizzle/0000_surface.sql`.
Its `meta` folder contains the snapshot and journal Drizzle needs to generate future
changes. The baseline creates the current schema and seeds the five default feeds.
Its journal timestamp retains the final migration cutoff from the previous chain,
so databases that completed that chain skip the baseline. The existing local
database was backed up and its migration history consolidated without changing
application data; the previous SQL files are archived under `data/backups`.
Older, partially migrated databases must finish the previous chain before using
this baseline.

Before applying future pending migrations to an existing database, startup creates
a consistent SQLite backup in `data/backups`, migrates a verification copy, checks
existing records and foreign keys, and then applies them. Stop development watchers
during schema rollout. Legacy assessments remain labeled stale, and profile
revisions preserve their context.

## Collect and review

- Configure company boards on Greenhouse, Lever or Ashby, documented job endpoints,
  or individual public posting URLs. Paste several URLs to inspect them before saving.
- Existing Remotive, Jobicy, Arbeitnow, RemoteOK and We Work Remotely feeds are kept
  as independent sources. Default monitoring is every 12 hours; existing feeds
  first become due 12 hours after migration. Activity offers 6-hour, 12-hour,
  daily and manual-only schedules, pause, run detail and retries.
- Refresh requests return `202` and a persisted run ID. Active and recent eligible
  source fetches are shared; manual refresh cannot bypass provider backoff.
- Public pages require explicit JobPosting JSON-LD, known embedded structured job
  data, or JobPosting microdata. Pages needing login/JavaScript and arbitrary
  non-posting pages are saved with an explanation of unavailable collection.
- Jobs retains filters, sort, page and selection in the URL. Inbox/Saved/Dismissed,
  eligibility, availability and analysis state are separate. Dismiss offers Undo.
- Inbox defaults to matching Profile target roles against job titles, including
  common spelling variants and developer/engineer synonyms. All roles shows every
  collected job; Saved and Dismissed default to all roles. Search and pagination
  apply within the selected role filter. Collection retains every job. With no
  target roles (or only Not listed), all jobs remain visible. Assessments run only when explicitly requested in the job reader.
- Strong cross-site matches combine source references. Ambiguous matches offer
  Same job / Keep separate; manual merges preserve original rows and can be undone.
- Only complete successful inventories establish disappearance. First absence is
  missing; third is closed. Another observed source keeps the logical job open.
- Raw evidence is downloaded as an attachment. Activity provides an explicit
  cleanup preview, retaining the latest content for every URL and all structured
  history. Unknown posted dates remain unknown.

Provider documentation: [Greenhouse](https://docs.greenhouse.io/job-board.html),
[Lever](https://github.com/lever/postings-api),
[Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api),
[Remotive](https://github.com/remotive-io/remote-jobs-api),
[Jobicy](https://github.com/Jobicy/remote-jobs-api).
The collector permits at most 100 pages and 8 MiB per response with validated
public destinations, DNS pinning, validated redirects and timeouts. Larger or
incomplete inventories remain partial and cannot establish closure.

Job descriptions have an on-demand **Summarise** button and a separate **AI Summary**
tab. Summaries cover company context, responsibilities, required and preferred
qualifications, working arrangements, compensation, benefits and application details
from the full posting. The prompt requires explicit handling of missing or conflicting
facts. Summary text streams as the provider responds, renders as Markdown headings,
lists, emphasis and links, and is saved after validation; **Regenerate** requests
a fresh summary. Providers returning buffered JSON still work. Older summary formats
are marked for regeneration with the improved prompt.
Changed descriptions mark old summaries as outdated. Summaries never include your profile or run automatically.

## OmniRoute assessment

Configure `apps/backend/.env`, which [Bun loads automatically](https://bun.sh/docs/runtime/environment-variables):

```dotenv
OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1
OMNIROUTE_API_KEY=your-local-endpoint-key
OMNIROUTE_MODEL=auto
```

Save your Profile, open a job’s **Assessment** tab, and click **Assess this job** for a brief plain-text
recommendation: whether to apply, the strongest match, the main gap, and a next
step. Clicking Assess starts the AI request immediately, without a queued work item
or automatic retries. If AI is busy, the request reports that immediately. Scraping
and profile changes never start assessments automatically. You can
request an assessment for an Inbox, Saved, or Dismissed job, including roles outside
your targets. Missing or incomparable facts need clarification.
Free-text preferences and deal-breakers remain advisory.

AI requests have no daily quota or reset schedule. Settings retains configuration status
and the pause control. Two model requests can run concurrently to keep the local service
responsive. Assessments are started from the job reader.
No analysis backfill runs during migration. Collection works without AI.

Assessments cite supplied job/profile excerpts, distinguish interpretation from
facts, and record the job version, profile revision and assessment format version.
Stale in-flight output is discarded. Successful results persist independently.
Background changes announce **Updated results available** without replacing the
review list. Only current assessments contribute to Best fit ordering.
OmniRoute memory is disabled; its configured upstream models may receive prompts.

## Docker

```sh
# Set these in a root .env first if you want AI assessments.
# OMNIROUTE_DOCKER_BASE_URL=http://host.docker.internal:20128/v1
# OMNIROUTE_API_KEY=your-local-endpoint-key
# OMNIROUTE_MODEL=auto
docker compose up --build -d
```

Compose builds `apps/backend/Dockerfile` and `apps/web/Dockerfile` separately.
The backend reaches a host-running OmniRoute through `host.docker.internal` by
default. Use `OMNIROUTE_DOCKER_BASE_URL` when OmniRoute is reachable elsewhere;
keep the local-development `OMNIROUTE_BASE_URL` value separate because
`127.0.0.1` inside a container refers to that container.

Separate web/backend services persist SQLite, backups and snapshots under `./data`.
Set `FIELDWORK_DATA_DIR` for a different local mount and `FIELDWORK_WEB_PORT` for a
port other than 3000. The backend reaches a host gateway using
`host.docker.internal`; `OMNIROUTE_BASE_URL` can override that address.
The web port binds to loopback; the backend is internal to the Compose network.

If a machine lacks Docker Buildx, install/repair its plugin or build with its
available legacy builder and use `docker compose up --no-build` with matching
project image names. Dependency install scripts are disabled in the image because
the runtime uses Bun SQLite and does not need Drizzle Studio's native driver.

## Verification

```sh
bun run lint
bun run check-types
bun run build
```

Browser review remains manual: desktop/mobile, keyboard, long titles, reader focus,
empty/error states, source links and stability during background updates.

Frontend features own their UI; browser-safe Zod contracts are exported through
`@surface/contracts`. General controls live in `components/ui`; selected Beautiful
UI structures live in `components/ai` with attribution and the MIT license.
See [design.md](design.md) for tokens and interaction rules.

## Personal profile and onboarding

New workspaces start at `/onboarding`, with PDF résumé prefill or manual entry,
then career goals, experience, work preferences and a final review. Setup can be
skipped; existing profiles open normally. `/profile` reuses those fields in a
sectioned editor and shows only answered information in its overview. Analysis
controls now live in `/settings`.

Roles, skills, industries and priorities use catalogs. Country/city search uses a
bundled global dataset, with canonical country codes and city identifiers. Current
residence, preferred job locations and confirmed eligible countries are separate.
Existing free-text answers remain editable as previous profile notes. New optional
fields use the existing JSON context column, so no SQL migration is required.

`POST /api/profile/resume` accepts a PDF as multipart field `file`, or JSON
`{ "text": "..." }`. Text-based PDFs are limited to 10 MB and 30 pages; scanned or
locked files offer a pasted-text/manual fallback. OmniRoute proposes exact document
excerpts and catalog matches. Review selects replacements before anything reaches
the saved profile. Uploaded files are not retained. Explicit imports share the two-request concurrency control and can run
while automatic job analysis is paused.

The browser keeps an unsaved profile draft in tab session storage, keyed by the
saved revision. Saving clears that draft. Profile writes can include
`expectedRevision`; stale editors receive a conflict instead of overwriting a newer
profile. Country/city catalogs are exposed through `/api/profile/catalogs`,
`/api/profile/locations?country=IN&q=Mumbai&offset=0` and
`/api/profile/locations/:id`.

Job assessments receive saved personal context (excluding email) and every project without
summarization or truncation. Assessment format version 2 preserves citation
validation and marks previous-format results stale. Provider context-limit failures
remain visible; the app does not silently shorten the profile.

Location data: [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database),
ODbL 1.0. The derived snapshot, checksum, attribution and license are in
`apps/backend/src/modules/profile/data`.

## Company research

Open **Research**, enter a company name or URL, and confirm the company. Its name is
the library entry; reports, source snapshots, and Q&A belong to its stable company ID.
A known domain or unambiguous saved name reopens existing research. Same-name companies
on different domains remain separate, and renaming a company preserves its research.
Existing company cards and job readers also link to Research.

The company bar shows only links selected by an AI review after a fresh Crawlee inspection.
Use **Verify links** on an older report, or recheck the saved selection later. The custom
`inspect_company_link` and `publish_company_links` tools reject uninspected, blocked,
empty and duplicate destinations; the model filters out unrelated and unhelpful pages.
Reviews are saved independently, and a failed recheck retains the previous selection.
New report runs also review discovered links.

The collapsible Q&A pane extends alongside the company bar. Questions and answers have
distinct labels and separate copy controls.

The main pane contains a cited Markdown briefing covering products, open-source and
license evidence, hiring from India, careers, engineering, and useful links. A company
Q&A panel uses saved evidence by default. **Search web** explicitly enables our custom
SearXNG search and Crawlee read tools for one question; it resets off after sending.
Company research does not use provider-hosted search or automatically include your profile.
New companies are saved, but career pages do not become monitoring sources until you
connect them through Companies → Sources → Inspect sources.

Reports are versioned. Refresh gathers fresh sources and retains the previous report
until a valid replacement finishes. Stop cancels model and crawler work. Reloading
reconnects to persisted events; backend restarts mark unfinished work interrupted, with
sources retained for an explicit retry. Failed or partial drafts are labeled and do
not replace successful reports. Public source text is untrusted evidence; citations
and supplied URLs are validated before publishing the result.

Start the research dependencies:

```sh
docker compose up -d --build searxng crawler
bun run --parallel --filter web --filter backend dev
```

When using the Docker crawler, start only the web/backend dev scripts as shown above;
the root dev command also starts a local crawler on the same port.

For a fully local crawler, install Chromium once using
`bun --cwd apps/crawler x playwright install chromium`, run SearXNG with Docker,
and use `bun run dev`. The crawler runs on Node.js; the API continues to use Bun.
The crawler service binds to loopback outside Docker. Docker provides Chromium and its
OS dependencies in a pinned Playwright image. Crawlee uses Cheerio for static pages and
Playwright when rendering is needed. A local egress proxy validates and pins public DNS
addresses for HTTP and browser traffic; standard HTTP(S) ports only. Browser requests
block downloads, WebSockets, non-read methods, and private-network destinations.

Backend configuration defaults:

```dotenv
SEARXNG_BASE_URL=http://127.0.0.1:8080
CRAWLER_BASE_URL=http://127.0.0.1:4100
RESEARCH_MAX_ROUNDS=30
RESEARCH_MAX_PAGES=60
RESEARCH_TIMEOUT_MS=900000
```

Compose uses service hostnames internally. The SearXNG JSON API is enabled by the
checked-in settings. Search and crawling errors appear in research progress and sources.
Research runs have bounded execution and page counts, not a daily AI allowance.

The API provides `/api/research` (company library), `/api/research/resolve` and
`/api/research/confirm`, plus `/api/companies/:id/research` for detail/refresh,
`/questions` with `{ question, webSearch: false }`, and `/runs/:runId/events` and
`/runs/:runId/cancel` for replayable SSE and cancellation.

Verification:

```sh
bun test apps/backend/src/modules/research/research.test.ts
bun --cwd apps/crawler run test
bun run lint
bun run check-types
bun run build
```
