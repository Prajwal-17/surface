# Surface

A local job-review workspace: what is worth reviewing, why it fits, and where to act.
Jobs, Companies, Activity and Profile share a Next.js/shadcn interface backed by
Hono, Bun, Drizzle and SQLite. No crawler service or external database is needed.

## Development

Use Bun 1.4.1 or newer and Node 24 or newer. Root scripts use
[Bun workspace filters](https://bun.sh/docs/pm/filter); development uses
`--parallel` so both servers start despite the web-to-backend contract dependency.
ESLint and TypeScript configuration live directly in `apps/web`.

```sh
bun install
bun run db:migrate
bun run dev
```

Open http://localhost:3000. Next proxies `/api` to the backend on port 4000.
Use `BACKEND_URL` for a different backend. SQLite defaults to
`data/job-search.sqlite`; raw content-addressed snapshots live beside it.
The backend performs monitoring and analysis while the browser is closed.
Run one backend executor per data directory.

The database starts from one generated baseline: `apps/backend/drizzle/0000_surface.sql`.
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

## OmniRoute assessment

Configure `apps/backend/.env`, which [Bun loads automatically](https://bun.sh/docs/runtime/environment-variables):

```dotenv
OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1
OMNIROUTE_API_KEY=your-local-endpoint-key
OMNIROUTE_MODEL=auto
```

Save a usable Profile to enable automatic assessment of new or materially changed
relevant inbox jobs. Explicit hard mismatches stay inspectable and are not
submitted to the model. Missing or incomparable facts need clarification.
Free-text preferences and deal-breakers remain advisory.

The default allowance is **20 dispatched model requests per day**, with at most
**two concurrent requests**, initially in **Asia/Kolkata**. Failed calls and retries
consume the same persisted allowance. Settings offers a limit, timezone, pause and
**Analyze existing inbox**. Changing timezone does not reset the current allowance.
No blanket analysis backfill runs during migration. Collection works without AI.

Assessments cite supplied job/profile excerpts, distinguish interpretation from
facts, and record the job version, profile revision and assessment format version.
Stale in-flight output is discarded. Successful results persist independently.
Background changes announce **Updated results available** without replacing the
review list. Only current assessments contribute to Best fit ordering.
OmniRoute memory is disabled; its configured upstream models may receive prompts.

## Docker

```sh
# Set OmniRoute environment variables in your shell or a root .env first.
docker compose up --build -d
```

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
bun test apps/backend/src/modules/workspace/workspace.test.ts
bun run lint
bun run check-types
bun run build
```

Backend fixtures cover migration-compatible persistence, extraction/pagination,
duplicates, meaningful versions, source disappearance, scheduling/restarts, quota,
stale in-flight assessments and citation validation. Docker smoke tests use a
disposable mount and verify SQLite and raw files across container recreation.
Browser review remains manual: desktop/mobile, keyboard, long titles, reader focus,
empty/error states, source links and stability during background updates.

Frontend features own their UI; browser-safe Zod contracts are exported through
`backend/contracts`. General controls live in `components/ui`; selected Beautiful
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
the saved profile. Uploaded files are not retained. Explicit imports share the
persisted daily request allowance and two-request concurrency limit; they can run
while automatic job analysis is paused. Failed dispatched requests count too.

The browser keeps an unsaved profile draft in tab session storage, keyed by the
saved revision. Saving clears that draft. Profile writes can include
`expectedRevision`; stale editors receive a conflict instead of overwriting a newer
profile. Country/city catalogs are exposed through `/api/profile/catalogs`,
`/api/profile/locations?country=IN&q=Mumbai&offset=0` and
`/api/profile/locations/:id`.

Job assessments receive all saved personal fields and every project without
summarization or truncation. Assessment format version 2 preserves citation
validation and marks previous-format results stale. Provider context-limit failures
remain visible; the app does not silently shorten the profile.

Location data: [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database),
ODbL 1.0. The derived snapshot, checksum, attribution and license are in
`apps/backend/src/modules/profile/data`.
