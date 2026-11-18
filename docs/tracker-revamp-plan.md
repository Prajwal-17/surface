# Minimal tracker revamp plan

## Goal and boundary

A fast personal job tracker with two flat tables: Applications and Companies. Editing happens in cells or a small row editor, not in individual document pages. Start with a clean local dataset; Notion is a reference, not a sync target. Job discovery, crawling, scheduled work, and AI are outside the initial release. The sample preview is browser-local and is not the production data model.

## Workflow and fields

Applications: required opportunity and company; status (To apply, Applied, In conversation, Closed; default To apply); optional type (Job, Intern), posting URL, last contacted date, outcome when closed, and short notes. Store created/updated timestamps automatically. A company can have multiple applications. Company selection uses an existing company, with a quick create action. No application detail page.

Companies: required name; optional website, location, research status (Listed, To research, Outreach, Archived; default Listed), and short notes. Show a count linking to Applications filtered by that company. No company document page. The notes field is a small inline editor, not a rich-text document.

Applications table: search opportunity/company, status filter, sort by updated date (default), title, company, or last contacted. Columns are opportunity, company, status, type, last contacted, and posting link. Companies table: search name, status filter, sort by name or updated date; columns are name, website, location, status, applications. Outcome and notes may be edited in a compact row popover, keeping the default table narrow. On narrow screens allow horizontal scrolling with a visible affordance; retain keyboard access, labeled controls, focus states, and sufficient contrast. Use an empty state and explicit loading, save, and error feedback. Validate required names and URLs; do not silently lose edits. Offer confirmation for deletion and state how many linked applications will also be deleted.

## Architecture

1. Make the two routes the entire primary navigation and remove profile/onboarding dependencies from tracker startup. Preserve authentication required by the existing deployment. Hide and disable old feature entry points and workers, rather than assuming hidden UI stops background execution.
2. Introduce small SQLite tables for companies and applications, with a foreign key from application to company and indexes for company, status, and updated time. Choose cascade deletion explicitly and show its effect in the confirmation. Enforce valid enum values and non-empty names on both server and client. Store dates as ISO dates and timestamps as UTC. Use a versioned migration, including a fresh-database test and a tested reset path for an existing installation. Avoid dropping unknown user data during development.
3. Implement list/create/update/delete endpoints with server validation, stable error responses, and transactional relationship updates. Decide how to handle duplicate companies without silently merging them. Support search/filter/sort on the server when volume requires it; use deterministic tie-breakers and pagination if needed. Return counts for company rows without an N+1 query.
4. Replace the preview's browser-local data with API-backed React Query reads and mutations. Each edit must have a clear save boundary, pending state, failure recovery, and cache invalidation for both tables. Avoid overwriting edits on concurrent requests. Test links as safe HTTP(S) URLs and open external links explicitly. Keep the sample dataset behind an explicit development-only seed command; never seed automatically into a real workspace.
5. The current stack already has React Query. Consider TanStack Table only if its sorting, keyboard, and column model simplifies the implementation; a native table is sufficient at this scale. Do not introduce a spreadsheet grid, virtualization, complex saved views, or a library solely for appearance. Vercel AI SDK is already present, but no AI features are needed for this tracker. Revisit it only with a defined user-facing AI task.
6. Disable discovery/crawler schedulers and their startup paths; remove obsolete UI and API modules incrementally after checking imports, desktop packaging, migrations, and deployment. A hidden page alone is not enough to stop work. Preserve the auth and desktop infrastructure actually needed to run the application.
7. For the requested reset, identify the configured database and related app-managed data in each deployment, stop writers, and execute a documented explicit reset. Confirm that no Notion data is touched. A reset must also account for SQLite WAL/SHM files, attachments and worker state; verify the new database starts empty and stays empty after restart. Do not automatically delete unrelated files, credentials, or external data.

## Verification and acceptance

From a fresh database, create and edit a company and application, change every status, filter and sort, follow a company link to its applications, delete a record, and restart to confirm persistence. Check validation, empty/loading/error states, failed saves, deletion with linked applications, keyboard operation, mobile overflow, and both themes. Run focused API/database tests, web type checks, lint and build. Verify background work does not restart or insert records. Confirm an existing install can be reset and upgraded, and desktop packaging still starts.

## Delivery order

First: durable CRUD and relationship, table UI, startup without old workflows, explicit reset, and verification. Second: remove inactive legacy code and dependencies. Future: design discovery separately, including matching and deduplication, without changing the tracker workflow. A one-hour target is a prioritization goal, not a guarantee; do not sacrifice durable saves or reset correctness to meet it.

## Preview limitations

The current sample preview is an interaction mock: browser-local storage, illustrative companies, editable fields, basic search/status filter and name sorting. It does not use the backend, provide production validation or sync, implement notes/outcomes, or stop existing background processes. Its “Recent” order is insertion order. It is for feedback, not real applications.
