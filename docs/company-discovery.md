# Company discovery: first release

Milestones A–C live in the existing Companies workspace. Discover, Searches,
Watchlist, and Sources share existing company IDs, SQLite, the background
executor, job collectors, snapshot storage, and the cited research engine.
Configured job sources and saved job searches remain independent.

## Workflow

Add websites, YC profiles, or announcement URLs. CSV accepts `website`, `url`,
`company_url`, and `announcement_url` columns, up to 100 URLs. Saved funding/YC
rules default to daily at 09:00 in `Asia/Kolkata`; rules can be edited, paused,
resumed, or run manually. Each run captures its rule revision. Previous
companies and decisions remain available after edits.

New, Will apply, Later, Done, and Skipped organize review. Later stores a timestamp
without replacing the review state. Applied and Contacted are separate action
records with optional contact/job references and idempotency keys. Notes,
contact corrections, and action history survive enrichment. Archived companies
can be viewed and restored.

Initial enrichment collects identity, a cached logo/favicon, and published
contacts. Opening or shortlisting adds team/contact/careers checks. Shortlisted
companies are checked weekly. Find contacts checks fresh contact pages; failed
checks quietly retain existing facts and assets in the company reader. Existing research receives
stored discovery/contact evidence as cited sources. The reader’s manual Generate summary
action uses `/api/companies/:id/research/summary`, reads the official site, and
saves a cited overview as a `summary` research run and message. Opening the reader
only loads saved summaries; generation continues after the panel closes. Failed
regeneration retains the last saved summary. Contact source evidence is collapsed
below each contact, and profile links use recognizable site favicons. Dedicated AI relevance,
approach, and outreach tools are milestone D.

## Validated sources and limits

Live probes on 24 October 2026 produced fixtures under
`apps/backend/src/modules/company-discovery/fixtures/`:

- `yc-directory.json`: YC public directory search filtered to Fall 2026. The
  adapter reads the current public, search-only credentials from the official
  directory and uses its published launch-date index; no key is hard-coded.
- `yc-posthog.json`: stable company ID, confirmed website, Winter 2020 batch,
  logo, and named founders with public profiles. `has_email` never supplies an
  address and is deliberately ignored.
- `yc-topos-fall-2026.json`: a live profile confirming the Fall 2026 batch,
  stable provider ID, and official website returned by directory discovery.
- `funding-profound.json`: Profound's company link, USD 180 million Series D,
  and article publication date. The announcement date remains unknown.
- `searx-unavailable.json`: local default engines returned CAPTCHA/rate-limit
  failures. They are reported while TechCrunch RSS supplies independent leads.

TechCrunch is the enabled automated funding publisher. Other publishers use URL
intake until validated; automated rules reject unvalidated publishers. Crunchbase
is not configured and requires provisioned API access.

YC directory query URLs are disallowed by robots.txt, so the adapter uses the
public search API and permitted profiles. SearXNG is a fallback. Each automated
run reads at most 60 source pages; YC takes three pages of 20 newest launches.
Coverage caps are reported as partial. Narrow batches/rules or add known profile
URLs for larger historical batches. Source HTML/API changes fail explicitly.
SearXNG date filters never establish an evidence date.

Funding extraction requires explicit raised/secured funding and an attributable
company website, or asks for website confirmation. Names, favicons, valuations,
and rumored raises never establish identity or completed funding. Unknown dates
stay null. Matching amount/currency/stage and compatible dates reuse a funding
event across references; later rounds stay separate. Identity conflicts need
manual confirmation.

## Contact and asset guarantees

Before removing page chrome, the crawler captures mailto links, nearby person
context, structured Person/Organization data, public profiles, logos, and
favicons. Mailto links remain contact metadata, never crawl destinations.

Contacts prioritize founders/CEO, cofounders/CTO, engineering leaders, then
hiring. Generic addresses stay labeled inboxes, including inside Person objects.
Published and manual addresses do not acquire mailbox verification labels.
Manual corrections survive collection. Later email-provider verification must
include a named provider and verification timestamp.

Images use the existing public-destination checks, a 2 MiB limit, supported-format
validation, sanitized SVG, and a content-hash cache in `DATA_DIR/company-logos`.
The API serves restrictive headers. Official logo → favicon is the image
fallback. Company views omit missing or broken images. Failed checks retain
existing assets and do not downgrade an existing logo to a favicon. Image source and fetch date are stored.

Evidence reuses resources/snapshots and a six-hour shared page cache. Explicit
enrichment bypasses the cache. Excerpts, contact-method sources, checked times,
and available snapshot IDs stay attached to facts.

## Persistence and execution

`0001_smart_jackal.sql` and `0002_glossy_celestials.sql` add company metadata, work
payloads, and five tables: searches, signals, search matches, contacts, and actions.
The existing executor lease protects scheduling. Interrupted company work
resumes persisted URL outcomes; completed pages are skipped. Repeated discovery
reuses company/event identities. Failed sources can be retried without discarding
successful pages. Partial companies remain usable. Activity shows errors,
new/updated/unresolved/failed counts, and live processed/total counts.

API groups under `/api/company-discovery` cover search CRUD/run, intake,
opportunities, company detail/updates/actions, contact discovery/corrections,
unresolved confirmation, source status, and logos. Background requests return a
persisted run ID and HTTP 202. Existing `/api/runs` supplies progress and retries.
Research API routes and storage remain unchanged. Legacy Research UI routes redirect
into Companies while preserving company IDs and existing reports/sources/Q&A.

## Research in Companies

Overview and Research are shadcn reader tabs. Research contains Report, Company Q&A,
and Sources, with explicit Run research, report version selection, citation links,
streaming progress, cancellation, and retry. Overview’s Refresh details queues public
information collection independently of AI report generation.

The Has research filter uses existing `research_reports` before pagination and
switches to the All decision queue. Summary-only companies do not match. Research
indicators are computed from saved reports and report runs; no new storage or
migration is needed. Legacy companies with no discovery signal still appear.
Expand retains the mounted company reader and list, with URL filters and scroll
restored when returning. Old `/research` opens the report-filtered directory;
`/research/:companyId` opens that company’s expanded Research tab.

Merge verification: 46 backend tests, 36 frontend tests, and 66 browser assertions
passed. Browser fixtures cover report versions, citations, sources, saved Q&A,
manual generation, failed-run retention, legacy redirects, and desktop/mobile
layouts. Expand/Return preserves list filters, scroll, and an unsent question.
Before/after row hashes for nine local company/research tables were identical.
Captures and checks are under `/tmp/surface-merged-research-qa/`.

## Rollout and verification

Rehearse SQLite upgrades on an isolated copy using the
[backup and restore instructions](desktop.md#profile-backup-and-restore).

```sh
bun run lint
bun run check-types
bun run build
bun run --cwd apps/backend test
bun run --cwd apps/crawler test
bun run --cwd apps/web test
```

Backend suites use separate processes and in-memory SQLite databases. Added coverage includes
deduplication, same-name companies, contact provenance/corrections, timezones/DST,
paused rules, captured revisions, partial retries, restart recovery, and failed
asset retention. Browser QA uses the isolated restore, both themes at 1440, 1000,
and 390 pixels, and real APIs for actions/reminders, searches, overlays,
keyboard/focus, empty/error/partial states, and archive/restore. Session captures
and logs are under `/tmp/surface-company-qa/`.

Final validation: 39 backend tests, 7 crawler tests, and 36 frontend tests passed,
plus 64 browser assertions. Lint, type checks, builds, and a crawler Docker build
passed. The final isolated restore rehearsal preserved all pre-existing rows in
26 tables; its verification is in
`data/backups/company-discovery-1792830158902/verification.json`.
