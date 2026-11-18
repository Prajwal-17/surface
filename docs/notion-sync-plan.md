# Notion-backed tracker: implementation plan

## Decision and scope

Notion is the authoritative store. Surface maintains a local, read-only projection of the selected Notion Applications and Companies data sources for fast tables, search and future agent lookups. Users edit Notion directly. No Surface action in this phase creates, edits, archives or deletes Notion records. Job discovery and writing found jobs to Notion are later work; no bidirectional sync or conflict resolution is required now. A local cache can be stale or incomplete, so the UI must say when it was last successfully synced and when content is unavailable.

A Notion database row is technically a page with properties and optional block content. The interface can show those properties in tables without requiring a page-based workflow. Full database coverage means every accessible row and property plus accessible page block trees, not a guarantee of perfect offline rendering of all Notion features or permanent copies of attachments. When Notion's API cannot expose something, record and show that limitation and offer Open in Notion.

## Existing code and gap

- `apps/web/src/features/tracker/demo.tsx` now contains a substantial API-backed table with search, filters, sorting, pagination and editable forms; despite the filename it is not merely the earlier localStorage mock. Reuse the table components and presentation, remove create/edit/delete controls and mutations for this phase, and replace hard-coded status choices with discovered metadata. Preserve keyboard access and responsive scrolling.
- `apps/backend/src/modules/tracker/routes.ts` currently exposes local CRUD. `apps/backend/drizzle-sqlite/0009_minimal_tracker.sql` defines separate tracker tables. These require one company, constrain status values and have cascade delete. Migration `0010_tracker_company_immutable.sql` blocks changing the company. Notion relations permit zero or multiple IDs and can change. Do not reuse those assumptions for a mirror. Disable mutation routes for the mirrored records rather than only hiding buttons.
- Desktop uses SQLite under Electron userData (`apps/desktop/src/paths.ts`), Zod at backend boundaries, IPC settings and Electron safeStorage (`apps/desktop/src/settings.ts`). Existing safeStorage code can fall back to plaintext or basic_text; do not claim that it always encrypts securely. The Settings link currently needs to be restored in navigation.
- Existing tracker and other local data may be real. Introduce a separate mirror namespace and migration; do not run reset scripts, delete existing tables or auto-import/merge local rows. Provide an explicit later migration decision if needed.

## Production schema observed

The original workspace was read through the provided integration. Use property IDs and types discovered from the selected source, not hard-coded labels, to tolerate renames. Names below describe the observed initial mapping; verify them when connecting.

| Applications property        | Notion type                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Opportunity                  | title                                                                              |
| Company                      | relation to Companies                                                              |
| Link                         | URL                                                                                |
| Status                       | select: To apply, Applied, In conversation, Closed                                 |
| Type                         | select: Intern, Job                                                                |
| Outcome                      | select: Offer accepted, Offer declined, Rejected by company, No response, Withdrew |
| Channels used                | multi-select: Careers page, Email, Job board, LinkedIn                             |
| Last contacted               | date                                                                               |
| Created at / Last updated at | created time / last edited time                                                    |

| Companies property           | Notion type                                     |
| ---------------------------- | ----------------------------------------------- |
| Company                      | title                                           |
| Website                      | URL                                             |
| Country / State              | rich text                                       |
| Research status              | select: Listed, To research, Outreach, Archived |
| Tags                         | multi-select                                    |
| People / Notes               | rich text                                       |
| Applications                 | relation to Applications                        |
| Created at / Last updated at | created time / last edited time                 |

There is no separate Job database in this observed model. An opportunity is an application row and is not necessarily an application that has actually been submitted. Do not invent a Job ID or assume every row has one.

## Identity and storage

Use Notion page UUID as the canonical external ID for each company/application; preserve database ID, data-source ID and workspace/connection identity separately. Expose copyable labeled IDs and Open in Notion; accept a canonical UUID or Notion page URL for future agent lookup, validate it, and resolve it only within the configured workspace and expected record type. If Notion's optional unique-id property exists, preserve/display its value too; it is not the page UUID. Source job IDs/URLs, when discovery exists, are separate external identifiers and never substitute for Notion page IDs. Do not create new IDs in the user's Notion schema without a separate decision.

Proposed SQLite tables, names illustrative:

- `notion_connections`: local connection ID, workspace ID, selected database/data-source IDs, API version, connection state; no token.
- `notion_sources`: connection, kind, database and data-source IDs, schema JSON/hash, last successful full sync and cursor/watermark. Unique per connection + source.
- `notion_records`: connection, source, Notion page ID, page URL, last-edited/created times, archived/trash state, validated property payload and indexed normalized title/status/URL. Unique `(connection_id, source_id, page_id)`. Keep unknown accessible properties as structured data rather than silently discarding them.
- `notion_relations`: connection, source page ID, property ID and target page ID; composite unique key. Keep unresolved targets and render an explicit unavailable state. Avoid a foreign key that discards relations to inaccessible or not-yet-loaded pages.
- `notion_blocks`: connection, page ID, block ID, parent block ID, sibling order, block type, validated raw content, child state and fetch timestamp. Store trees only for accessible page content, including paginated descendants. File URLs can expire; do not present cached signed URLs as durable downloads.
- `notion_sync_runs` and staging tables: run ID, source, mode, start/end, progress/counts, status, sanitized errors and reconciliation generation. Keep last-good published snapshot independently of incomplete runs.

Store full typed Notion property data, including option IDs, colors, formatted rich text, date/timezone and relation targets. Add indexes for common search, status and relation lookups based on measured usage. Do not log tokens, full private content, or raw API payloads. Protect cached workspace data with OS file permissions; explain it is available offline on the device. Data-source ID and database ID must not be conflated under the current API.

## Connection and settings

Add Settings → Notion with masked token input, Save/replace/remove, selected Applications and Companies database links/IDs, Test connection, Sync now, progress, last successful sync, and a clear error/reconnect action. On test, query the selected databases and resolve their data sources; confirm the titles, required property types and relation target before activating. Where multiple data sources exist, require an explicit selection. Detect read permissions for both and accessible page contents; never test by modifying production records.

Keep the token in Electron main process using OS-backed secure storage; expose only connection state/has-token over narrowly scoped, validated IPC. Never return it to renderer, logs, frontend state after save, SQLite, URLs or diagnostics. If genuine OS encryption is unavailable (including Linux basic_text), block persistent saving and offer a clearly labeled session-only connection instead. Define how the backend obtains access without secrets in command-line arguments or an unauthenticated HTTP endpoint: prefer a main-process Notion client with a narrow IPC/service boundary, or an authenticated local channel after threat review. Changing token, workspace, or selected sources creates a new connection namespace, cancels in-flight work, and never displays one workspace's cache as another's. Disconnect removes the credential; make local cache removal a separate explicit action.

## Sync protocol

1. Pin a supported Notion API version and SDK. Discover both source schemas, map required properties by ID and type, and persist complete metadata. Unknown options are valid display data. Missing/changed required properties, relation targets, access or unsupported types become visible schema errors; preserve the last good snapshot. Zod validates external response envelopes and known property variants, accepts forward-compatible unknown variants as tagged unsupported data, and strictly validates local normalized records. Never silently coerce invalid IDs, dates or relationships.
2. Initial full sync: fetch both schemas, then paginate all accessible rows of both sources. Retrieve additional property items where API responses truncate relations or other paginated properties. Read each page's block children recursively, including pagination and nested children, with bounded concurrency and cycle/depth/size protections. Nested databases and unsupported or inaccessible blocks are recorded as such; never claim they were completely mirrored. Record row and block failures individually. Respect rate limits and pagination.
3. Stage records and relation edges; only publish a source generation after every required page has been fetched and validated. A partial or interrupted run retains the previous snapshot; progress and failures remain visible. Apply each published generation transactionally, and atomically update its checkpoint. Synchronize sources under a single lock; surface cross-source partial freshness until both generations complete. Ensure app restart recovers abandoned staging safely.
4. Incremental refresh: fetch pages changed since a persisted watermark with overlap, paginate, upsert idempotently by page ID and use deterministic tie handling. Refresh page blocks independently: verify with test cases whether block-only edits advance the parent page timestamp; if not, use periodic full content reconciliation or supported events, not a false freshness guarantee. Update the watermark only after the relevant complete run is committed. Define a reconciliation schedule to catch archive, deletion, moved pages, permission and schema changes; do not infer deletion from a failed or incomplete scan. Mark missing/archived records only after a complete successful authoritative reconciliation, with explicit inaccessible/unknown states when deletion cannot be proven.
5. Trigger sync on startup, manual Sync now, and periodically while the desktop app is running (initial default 15 minutes, adjustable later). No claim of background sync while app is closed. Offline/errors retain last-good data and display stale state. Only one run per connection; cancel on disconnect or source change. Queue requests, limit concurrency, honor Retry-After for 429/529, use bounded backoff and report failures. Do not retry blindly on permission errors. Pin a safe request budget and account for workspace-level limits. [Notion request limits](https://developers.notion.com/reference/request-limits)
6. A successful sync means both complete row scans, required property pagination and accessible block retrieval have succeeded for the declared scope; disclose unsupported or inaccessible content separately. Detect API query result ceilings and partition full scans safely; never silently truncate. [Notion data-source query](https://developers.notion.com/reference/query-a-data-source)

## Read-only table UX

Applications and Companies use the existing compact native tables and actual Notion property names, types, values and relation links. Initial visible columns follow the production property lists; allow horizontal scroll and optional column visibility. Display select/multi-select values as labeled chips; relation cells open the other filtered table, date cells retain date semantics and URL cells open safe HTTP(S) links. Retain accessible search, filters, sorting, pagination, keyboard focus, loading/empty/error states and light/dark support. Exact reproduction of all Notion views and interaction is not guaranteed by the API; preserve values and metadata rather than inventing view state. No inline edits, add, delete, archive or drag-to-modify.

A row can expose a read-only property inspector and accessible page content; unsupported blocks or temporarily unavailable files show Open in Notion. Provide a small copy-ID action and Open in Notion for every row. Distinguish last sync time from Notion's last edited time; show stale, partial and disconnected states. Never render external HTML unsanitized or automatically fetch arbitrary links/images from untrusted block data.

## Test workspace and rollout

A separate test tracker was created under the shared test workspace, with a Companies database, Applications database and a linked sample row with paragraph content. Creation and a relation query succeeded using the older API version; production sync must target and test the pinned current version before implementation. The production schema above was inspected read-only; no production changes were made.

Implement in phases: (1) credential and schema discovery; (2) storage plus initial paginated sync; (3) reconciliation and incremental refresh; (4) read-only table/inspector; (5) fault and restart testing; (6) limited production read-only connection. Use fake API fixtures and temporary SQLite for automated tests, then exercise only the isolated test workspace. Test multi-page pagination, >25 relation values, empty/multiple relations, renamed properties, newly added options, nested blocks, unsupported blocks, file expiry, deleted/archived records, revoked access, 429/529, failed fetch, interruption, overlapping edits, concurrent sync, connection switching, and stale-data UI. Compare Notion and local counts, IDs, values and relationships after full and incremental sync, and prove failed sync cannot erase a prior good snapshot. Run desktop packaging, backend tests, type checks, lint and build.

Do not call this done until test workspace changes in Notion appear in Surface after sync, no Surface action can mutate Notion, the old local data remains intact, and the UI reports limitations honestly. Further automatic job creation is a separate design with explicit permissions, deduplication, write idempotency and user approval of its behavior.
