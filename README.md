# Surface

Surface is an Ubuntu desktop workspace for finding jobs, tracking applications,
and drafting outreach. Electron serves the React interface through a local Hono
backend. Jobs, company research, profiles, and drafts are stored in SQLite.

## Development

Use Bun 1.4.1 or newer and Node 24 or newer.

```sh
bun install
bun dev
```

`bun dev` builds the app from the checkout and opens the **Surface Dev**
Electron window. The local backend applies pending SQLite migrations on startup.
The app reuses `~/.config/Surface Dev/surface.sqlite3`. Set
`SURFACE_DESKTOP_USER_DATA` to an existing directory to run with an isolated
profile. Re-run `bun dev` after editing source files.

Turborepo coordinates workspace builds and checks. Shared TypeScript presets and
browser-safe API contracts live under `packages/`.

## Desktop packaging

```sh
bun run desktop:package:dev
bun run desktop:smoke:dev
```

The Ubuntu x64 installers are written to `apps/desktop/release/dev/`. Start
optional web search with `docker compose -f compose.searxng.yaml up -d`. See
[desktop setup](docs/desktop.md), including profile
[backup and restore](docs/desktop.md#profile-backup-and-restore).

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
a fresh summary. Summary progress uses the Vercel AI SDK structured stream, and
**Stop** cancels the provider request. Older summary formats are marked for
regeneration with the improved prompt.
Changed descriptions mark old summaries as outdated. Summaries never include your profile or run automatically.

## AI assessment

AI features use the Vercel AI SDK through the user's OpenCode Go subscription.
In the desktop app, open **Settings → AI** and save your provider model and
OpenCode Go API key there; the app stores the key with OS encryption and applies
it to the running backend. Transport, service URLs, and the crawler URL live on
the same Settings page. No `.env` file is read anywhere; standalone server runs
receive configuration through process environment variables.

```sh
AI_PROVIDER=opencode-go AI_BASE_URL=https://opencode.ai/inference/go/openai/v1 \
AI_MODEL=deepseek-v4.1-flash OPENCODE_GO_API_KEY=your-key bun --cwd apps/backend start
```

`OMNIROUTE_*` variables are no longer used. If they remain set, Surface warns at
startup and never sends the old key to OpenCode. Add a separate OpenCode Go key.
Desktop installs keep their old OmniRoute key only as legacy data in
`settings.json`; the version-2 settings migration writes a `.v1.backup.json` file
next to it.

Save your Profile, open a job’s **Assessment** tab, and click **Assess this job** for a brief plain-text
recommendation: whether to apply, the strongest match, the main gap, and a next
step. Clicking Assess starts the AI request immediately, without a queued work item
or automatic retries. If AI is busy, the request reports that immediately. Scraping
and profile changes never start assessments automatically. You can
request an assessment for an Inbox, Saved, or Dismissed job, including roles outside
your targets. Missing or incomparable facts need clarification.
Free-text preferences and deal-breakers remain advisory.

AI requests have no daily quota or reset schedule. Settings retains configuration status
and the pause control. Two model requests can run concurrently. Assessments are
started from the job reader.
No analysis backfill runs during migration. Collection works without AI.

Assessments cite supplied job/profile excerpts, distinguish interpretation from
facts, and record the job version, profile revision and assessment format version.
Stale in-flight output is discarded. Successful results persist independently.
Background changes announce **Updated results available** without replacing the
review list. Only current assessments contribute to Best fit ordering.
Prompts are sent directly to the configured OpenCode Go model. Resume text,
profiles and job descriptions may be included in the prompts for the feature you
request; API keys are never sent to the browser.

## Docker

```sh
# Pass AI settings inline when you want AI assessments; no .env file is read.
AI_PROVIDER=opencode-go \
AI_BASE_URL=https://opencode.ai/inference/go/openai/v1 \
AI_MODEL=deepseek-v4.1-flash \
OPENCODE_GO_API_KEY=your-key \
bun run prod
```

`bun run prod` builds and starts the production Compose services, waits for the
web app, and opens http://localhost:17000 in the default browser. For a headless
start, use `docker compose up --build -d`. Set `FIELDWORK_PROD_WEB_PORT` in the
shell to use a different production port.

Compose builds `apps/backend/Dockerfile` and `apps/web/Dockerfile` separately.
The backend calls the hosted OpenCode Go API directly. Keep
`OPENCODE_GO_API_KEY` in the shell environment; it stays server-side.

Compose keeps SQLite, snapshots, and the session signing key in the mounted data
directory. Set `FIELDWORK_DATA_DIR` to change the mount or
`FIELDWORK_PROD_WEB_PORT` to change the loopback web port.

## Verification

```sh
bun run lint
bun run check-types
bun run build
bun --cwd apps/backend test
```

Each backend suite gets an in-memory SQLite database and its own temporary
asset directory. `bun run verify:sqlite` checks migrations and reopening a
SQLite file on disk.

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
locked files offer a pasted-text/manual fallback. The AI provider proposes exact document
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

Open **Companies**, select a company, and switch its reader from **Overview** to
**Research**. Choose **Run research** to generate a deeper cited report. Overview
keeps company facts, funding, contacts, jobs, decisions, and the optional
short AI summary together. **Refresh details** checks public company information
without generating a research report.

Use **Has research** to find companies with saved reports across decision queues.
List indicators distinguish saved reports, active research, and unfinished runs.
**Expand** opens the company across the workspace; **Back to companies** restores
the list, filters, scroll position, and any Q&A draft.

Reports, source snapshots, questions, and answers keep their existing
company IDs and storage. No data migration or deletion is needed for this navigation
change. Old `/research` links redirect into Companies, and `/research/:companyId`
opens the same saved research in the expanded company reader.

The company bar shows only links selected by an AI review after a fresh Crawlee inspection.
Use **Verify links** on an older report, or recheck the saved selection later. The custom
`inspect_company_link` and `publish_company_links` tools reject uninspected, blocked,
empty and duplicate destinations; the model filters out unrelated and unhelpful pages.
Reviews are saved independently, and a failed recheck retains the previous selection.
New report runs also review discovered links.

Report, Company Q&A, and Sources tabs share the research reader. Questions and
answers have distinct labels and separate copy controls; older report versions
remain selectable.

The main pane contains a cited Markdown briefing covering products, open-source and
license evidence, hiring from India, careers, engineering, and useful links. A company
Q&A panel uses saved evidence by default. **Search web** explicitly enables our custom
SearXNG search and Crawlee read tools for one question; it resets off after sending.
Company research does not use provider-hosted search or automatically include your profile.
New companies are saved, but career pages do not become monitoring sources until you
connect them through Companies → Sources → Inspect sources.

Reports are versioned. Run research gathers fresh sources and retains the previous report
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

Backend configuration defaults (process environment for non-desktop runs; the
desktop Settings page supplies service URLs and AI credentials):

```
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

Company discovery (saved rules, funding/YC intake, contacts, and decisions) is documented in [docs/company-discovery.md](docs/company-discovery.md).
