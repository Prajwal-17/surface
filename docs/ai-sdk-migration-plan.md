# Vercel AI SDK migration implementation plan

Status: implementation is in progress on `migrate-ai-sdk`; see [the migration status](ai-sdk-migration-status.md). Start with [the inspected code inventory](ai-sdk-inventory.md). Baseline: `7186b1e`, 2026-11-17.

## 1. Objective and completion criteria

Migrate every model-driven Surface feature from custom OmniRoute HTTP/SSE/tool handling to the Vercel AI SDK, using the user's OpenCode Go subscription and DeepSeek V4.1 Flash. Cover backend generation, tool orchestration, live UI, desktop configuration, deployment and regression tests. Preserve saved jobs, profiles, assessments, reports, questions, evidence and verified links.

Complete means:

- All model calls go through one configured SDK provider instance/factory and typed SDK generation or agents.
- No application code manually decodes provider SSE, assembles provider tool calls, or parses partial summary JSON.
- Job summaries use SDK streaming on both server and React client; research keeps its durable run/event API with SDK generation underneath.
- All listed features work in browser/server and packaged desktop configurations, including failure, cancellation and restart cases.
- Evidence, citations, exact resume excerpts, version/staleness checks and deterministic eligibility remain enforced by application code.
- Old OmniRoute configuration has a documented transition; its key is never silently sent to OpenCode.
- Automated checks pass; a small live Go smoke test is recorded when the user supplies credentials securely. If unavailable, explicitly mark live verification pending.
- Implementation has incremental commits and a final PR with exact validation and any limitations.

## 2. Preparation already completed and required installation

Installed globally for Codex using the user-requested upstream repository:

```sh
npx skills add vercel/ai
# Successful unattended equivalent, run outside the Bun workspace:
npx --yes skills add vercel/ai --yes --agent codex --global
```

Installed and read: `~/.agents/skills/ai-sdk/SKILL.md` and `~/.agents/skills/migrate-ai-sdk-v6-to-v7/SKILL.md`. They become automatically available on the next turn. The second skill is useful API guidance, but this application is not currently on SDK v6. Another machine/thread must install/read the same upstream skills if unavailable there. The installer was run from `/tmp` because npm 11 rejects this repository's Bun `devEngines.packageManager`; do not weaken the repository's package-manager policy.

The requested package is `ai` (`npm install ai`). Do this during implementation, not this planning PR. Use the repository's Bun equivalent in the owning workspace:

```sh
bun add --cwd apps/backend ai @ai-sdk/openai-compatible
bun add --cwd apps/web @ai-sdk/react
```

Add `ai` to web only if it directly imports SDK runtime helpers/types. Keep SDK/provider runtime dependencies out of `packages/contracts` and Electron preload. Update only `bun.lock`; do not generate an npm lockfile. After installation, inspect each package's bundled docs/source before choosing exact APIs.

Registry snapshot during planning: `ai` 7.0.173, `@ai-sdk/openai-compatible` 3.0.92, `@ai-sdk/react` 4.0.177. Recheck compatible stable versions and engine requirements at execution time; do not assume identical major numbers across packages. Existing Node >=24 and ESM backend align with current v7 requirements; verify Electron's embedded runtime and bundle separately.

## 3. Provider decision and first execution gate

Use `createOpenAICompatible` from `@ai-sdk/openai-compatible`, with a provider object passed explicitly to SDK calls. This uses the Go subscription directly; a bare gateway model string or a direct DeepSeek API key would select a different service.

OpenCode's public [Go model catalog](https://opencode.ai/inference/go/v1/models), inspected 2026-11-17, reports:

| Setting                     | Verified value                                                                  |
| --------------------------- | ------------------------------------------------------------------------------- |
| Model ID sent to API        | `deepseek-v4.1-flash`                                                           |
| Display name                | DeepSeek V4.1 Flash 1017                                                        |
| Canonical identity          | `deepseek/deepseek-v4.1-flash-1017`                                             |
| Chat Completions base URL   | `https://opencode.ai/inference/go/openai/v1`                                    |
| Recommended AI SDK provider | `@ai-sdk/openai-compatible`                                                     |
| Advertised capabilities     | Tools, structured output, reasoning; API compatibility uses `reasoning_content` |

Do not send the OpenCode application configuration prefix `opencode-go/` as the API model ID. Do not copy older `zen/go/v1` examples without verifying them. Current [Go docs](https://opencode.ai/docs/console/go/) document direct API access and workspace restrictions; actual account access and combined tool/structured-output behavior still need a real request.

Proposed server environment contract:

```dotenv
AI_PROVIDER=opencode-go
AI_BASE_URL=https://opencode.ai/inference/go/openai/v1
AI_MODEL=deepseek-v4.1-flash
OPENCODE_GO_API_KEY=
```

Configuration precedence: explicit desktop runtime settings override startup environment for subsequent calls; an active call keeps its original provider/model snapshot. No key means AI is unconfigured but the rest of the app starts. Reject invalid provider/base/model values. Backend status exposes configuration state and model, never the key.

The implementation agent must retrieve the key through the environment's secure secret mechanism when needed. Do not ask for a secret in ordinary chat, commit it, put it in a Vite variable, log it, or embed it in test fixtures.

### Phase 0 — baseline and provider proof

- [ ] Read repository AGENTS.md, both planning documents and installed AI SDK skill.
- [ ] Record baseline format/lint/types/tests and prerequisite failures before edits; use isolated test storage.
- [ ] Install dependencies above and read version-matched bundled docs, including provider compatibility and reasoning handling.
- [ ] Re-fetch the complete Go model catalog; verify selected ID, base URL and adapter.
- [ ] With a securely supplied Go key, test non-streaming text, streamed text, structured Zod output, a two-step tool/result turn, reasoning continuity and abort. Test structured output with tools if needed by the chosen agent design.
- [ ] Verify whether the adapter preserves required `reasoning_content` across tool turns. Prefer supported provider options; if adaptation is required, keep it inside the provider boundary with a regression test, never reintroduce a stream decoder.
- [ ] Advertised structured-output support is provisional until tested. If strict JSON Schema is unsupported, use the SDK-supported JSON/output strategy with final Zod validation. Do not silently accept plain text or malformed JSON.
- [ ] Record Go auth/model/region/quota errors distinctly. Provider unavailability does not justify silently changing the user's requested model/provider.

Gate: provider compatibility is established, or the exact unresolved provider prerequisite is documented before making broad assumptions. Credential-independent migration/tests can proceed with SDK mocks while live verification remains pending.

## 4. Target boundaries

Proposed backend structure (names may follow local conventions):

```text
apps/backend/src/shared/ai/
  provider.ts       validated runtime snapshot -> OpenCode Go SDK model
  generation.ts     typed object/text generation and normalized result metadata
  capacity.ts       shared admission policy and slot ownership
  errors.ts         sanitized provider/auth/rate-limit/output/abort errors
apps/backend/src/modules/research/
  agent.ts          SDK agent, tool availability and step bounds
  tools.ts          typed tool adapters around SearXNG and crawler
  verified-links.ts separate bounded inspection/publication agent
  research.service.ts persisted domain lifecycle and final validation
```

Use `generateText` + `Output.object` for structured operations, `streamText` for streamed generation, SDK `tool` definitions, and `ToolLoopAgent` for model/tool loops. Keep business validation outside generic SDK wrappers. Do not replace model loops with a new home-grown agent framework.

Current v7 guidance differs from v6 examples: verify `instructions`, `isStepCount`, `stream`, `onEnd`, `onStepEnd`, `finalStep`, and stateless response helpers in installed docs. Use `runtimeContext`/scoped tool context where appropriate. Do not copy obsolete `system`, `stepCountIs`, `fullStream`, or result response helpers from old tutorials.

### Phase 1 — shared AI foundation

- [ ] Add the provider factory and typed generation adapters; allow dependency injection for meaningful offline tests.
- [ ] Replace scattered configured checks, including `executeAnalysis`'s static environment default, with one runtime source.
- [ ] Centralize capacity acquisition. Initially retain two concurrent provider requests and fail-fast busy behavior; avoid adding an unrequested application quota or an unbounded queue.
- [ ] Own slots for the actual duration of each generation/stream, including failure and cancellation. Avoid holding a parent slot while a nested link-verification call waits for another slot. Test simultaneous foreground/background admission.
- [ ] Set one retry policy coordinated with work-item retries. Retry only safe transient provider failures with bounded backoff; never replay a tool with side effects because an outer generation retried. Handle 429/provider allowance separately from local busy state.
- [ ] Thread AbortSignal through every adapter. Preserve existing per-call limits (120s structured, 180s research) and overall research timeout until provider tests justify changes.
- [ ] Retain bounded response/output handling equivalent to current 2 MB protection where applicable; use SDK-supported limits or a bounded transport wrapper, not a second protocol parser. Preserve feature-specific character/token bounds and avoid silent context truncation changes.
- [ ] Normalize SDK errors, finish reasons, model identity and available usage metadata. Truncated, empty, invalid and interrupted outputs cannot be reported as success.
- [ ] Explicitly handle errors delivered inside SDK streams and awaited final outputs; a surrounding try/catch alone is insufficient. Release slots and timers in all paths.
- [ ] Keep operational logging small: feature/run/model, duration, finish reason and token counts when available; exclude resume text, profiles, keys and raw prompts. DevTools only if explicitly enabled locally.

Gate: one provider/config/admission path is covered by offline tests before all consumers move.

### Phase 2 — structured backend consumers

- [ ] Migrate `analysis/model.ts` while retaining `assessmentContext`, `validateAssessment`, deterministic eligibility and saved assessment model metadata.
- [ ] Verify manual and queued analysis preserve revision/format identities, leases, stale-result rejection, pause and retry behavior.
- [ ] Migrate `profile/resume.ts`; preserve text/PDF parsing, excerpt validation, deterministic normalization, injectable test model and user-reviewed draft save.
- [ ] Migrate `resolveCompany`; preserve domain allowlist, candidate bounds, disambiguation, confirm flow and duplicate identity rules.
- [ ] Keep existing shared Zod contracts as final validation. Draft/partial values must never enter persistence as complete results.

Gate: structured features pass domain regressions and no longer use the raw model client.

### Phase 3 — job summary server and React stream

Decision: use a structured SDK stream with typed UI data carrying provisional text and the final persisted `DescriptionSummary`. Adopt a version-matched SDK UI stream reader/React transport; use a small transport adapter if required by `useChat`, rather than treating this as a conversation. This preserves the important complete record while removing manual NDJSON and partial-JSON parsing. Prove this server/client pair in a small test before wiring the screen; `useObject` is acceptable only if it supports the required validated persistence acknowledgement through a documented mechanism.

- [ ] Generate `{text}` with `streamText` + `Output.object`; consume partial output for display and await the validated final output for saving.
- [ ] Replace NDJSON negotiation in `jobs.routes.ts` with the documented SDK stream protocol, including explicit final saved-summary data and errors. Preserve the non-streaming JSON response for existing callers, or version it with documented compatibility.
- [ ] On cached summary return, emit the same final-completion contract without a paid generation.
- [ ] Propagate request disconnect/explicit stop to the SDK AbortSignal; await ordered writes with backpressure. Remove fire-and-forget swallowed writes and clean up heartbeat/timers on every exit.
- [ ] Replace `summary-stream.ts` with SDK-based React stream state and update `job-detail-sheet.tsx`. Bind state to job ID/version; stop/reset on navigation or regeneration so late chunks cannot update another job.
- [ ] Keep saved output visible until replacement commits; label drafts as provisional, expose loading/stop/retry and accessible error states, and invalidate Query cache only after persisted completion.
- [ ] Preserve `pending`, `DESCRIPTION_SUMMARY_FORMAT_VERSION`, job-version conditional update, original description and existing summary on failure.
- [ ] Test Unicode, fragmented input, partial output validation, cached response, abrupt disconnect, provider error after first text, write failure, stale job and duplicate generate.

Gate: text arrives progressively, completion means persistence succeeded, and cancellation stops provider work. Delete summary regex and NDJSON reader only once both sides have migrated.

### Phase 4 — research and verified-link agents

- [ ] Convert search/crawl definitions to typed SDK `tool()` values with current Zod inputs and executors. Preserve public URL validation, crawler cancellation, duplicate request cache, source IDs and source provenance.
- [ ] Replace the research loop and `ModelMessage`/`ToolCall` shapes with `ToolLoopAgent` and SDK model messages. Pass trusted instructions separately from untrusted page/profile/tool data.
- [ ] Retain report/question/summary/link-only modes and forced initial homepage/evidence collection. Saved-evidence Q&A exposes no web tools; enabling the globe toggle permits the existing search/crawl tools only.
- [ ] Preserve total rounds/pages/time limits, max calls per step and deterministic source persistence. Configure `prepareStep` and stop conditions so the final allowed step produces an answer without further tools. Verify off-by-one behavior in SDK step counting.
- [ ] Convert `verified-links.ts`'s second loop into a separate agent with inspect/publish tools. Keep 12-round/16-inspection bounds, candidate allowlist, readable successful inspected pages only, deduplication, category limits and validated publication as the terminal condition. Plain text does not count as publication.
- [ ] Keep `citeMarkdown`, company ownership, supplied URL checks and exactly one bounded citation repair. Repair must reuse existing evidence and stay inside the overall execution budget; use an SDK continuation/generation rather than resurrecting a raw tool loop.
- [ ] Separate intermediate/tool-step text from the final answer. Reset draft snapshots between relevant steps; tool commentary or a previous step's text cannot become the final report. Audit v7 all-steps results versus `finalStep`.
- [ ] Coalesce draft persistence/events at a documented interval, flush before terminal state, and preserve ordered progress/text/done records. UI text events remain replacement snapshots, not deltas.
- [ ] Retain run-owned AbortControllers, explicit cancel, crawler cancellation, restart recovery and transactional final save. Closing an SSE subscriber must not cancel a background research run.
- [ ] Preserve previous valid reports/answers/link reviews on errors, partial/cancelled/interrupted drafts and evidence; never publish an unvalidated replacement.

Gate: remove `research/model.ts` and raw provider tool structures when research and link verification tests pass.

### Phase 5 — research UI and shared AI components

Decision: retain the durable research SSE domain protocol. AI SDK is responsible for provider streaming and agents; database run replay remains an application concern. Converting this to a request-scoped `useChat` endpoint would regress reload/reconnect/background execution unless equivalent durability were separately built.

- [ ] Extract a typed `useResearchRun` hook/store from `company-research.tsx`; keep TanStack Query for persisted detail and mutations, and EventSource for replayable domain events.
- [ ] Seed draft state from the active persisted run; deduplicate events/cursors and handle malformed records, reconnect, heartbeat, done/end, switching company and unmount.
- [ ] Add explicit connecting/gathering/writing/completed/partial/failed/cancelled/interrupted UI states derived from existing lifecycle data; do not infer success from socket closure.
- [ ] Preserve report version selection, Q&A web toggle, source/citation reader, company summary and independently refreshed verified links.
- [ ] Review `StreamingText`, research composer, task rows, clarification/report rendering and AI loading components for stream batching, long output, markdown safety and accessible announcements. Avoid gratuitous redesign.
- [ ] Reconcile terminal events and query invalidations across company reader, list indicators, summary and report views without duplicate runs or stale draft flashes.
- [ ] Update resume import, analysis settings and job-assessment error/configuration messaging to the new common error contract.

Gate: navigation, reload, reconnect and Stop retain the current persisted lifecycle and display correct results.

### Phase 6 — desktop, settings and deployment

- [ ] Introduce version-2 provider-neutral desktop settings and matching input/snapshot types. Update Electron main/preload, web desktop declarations, backend runtime-update endpoint and settings form together.
- [ ] Read and back up version-1 settings before writing v2; preserve SearXNG and secret-storage behavior. Retain old OmniRoute credentials only as legacy data and require a separate Go key. Never associate an old key with a newly defaulted Go URL.
- [ ] Define deterministic handling of legacy env vars: accept them only as an explicitly documented temporary legacy-provider path if required, or give an actionable migration message. Final Go mode must not silently use OmniRoute `auto` or localhost defaults.
- [ ] Test blank-key retain, explicit clear, encrypted storage, existing fallback modes, restart, settings corruption, runtime updates and snapshot key redaction. Preserve existing storage disclosures.
- [ ] Replace OmniRoute diagnostics and wording. A reachable `/models` response is only reachability; separate key presence, authenticated model access and optional deliberate generation probe. Avoid paid requests on automatic diagnostic polling.
- [ ] Pass new configuration at desktop startup and runtime updates; ensure active calls retain a stable snapshot and new calls use changed settings. Update desktop smoke-test payloads and diagnostic field names.
- [ ] Update Compose, root/backend env examples and README/desktop docs. Keep SearXNG, crawler, snapshots and storage configuration; remove only obsolete AI-local-host assumptions.
- [ ] Build backend/web/desktop and verify the packaged backend resolves ESM provider dependencies in Electron's runtime. Keep provider keys server-side in browser mode.

Gate: an existing desktop install upgrades without losing data or leaking/reusing its old provider key; browser deployment uses the documented server environment.

### Phase 7 — removal, verification and release

- [ ] Delete unused `shared/model-client.ts`, `shared/model-stream.ts`, `research/model.ts`, old JSON/SSE/tool types and superseded UI stream code after all callers migrate.
- [ ] Search for `OMNIROUTE`, `omniroute`, `/chat/completions`, `readModelStream`, `decodeResearchResponse`, `partialSummaryText` and custom `ToolDefinition`. Remaining occurrences must be intentional migration docs/fixtures or SDK provider configuration, not active manual inference paths.
- [ ] Update research tests' raw response mocks and obsolete decoder assertions to version-matched SDK test utilities or a mocked provider fetch boundary. Keep meaningful application invariants; do not test SDK internals by recreating its decoder.
- [ ] Add new stream/admission/config/settings tests and extend SQLite persistence/reopen cases. Add a PostgreSQL CI service/job to run the backend suite if current desktop CI does not cover it.
- [ ] Run the matrix below and record exact commands/results. Fix regressions, rerun affected checks and then the required full gates.
- [ ] Run a small live Go smoke test for each distinct generation mode, then one end-to-end research/tool flow with non-sensitive sample data. Keep live-key tests opt-in and outside normal CI.
- [ ] Update short changelog entries grouped by features/fixes as applicable; document settings transition and rollback.
- [ ] Open the final implementation PR, link it in the implementation thread, and include evidence, residual risks and live-test status. Do not merge automatically.

## 5. Validation matrix

| Boundary              | Required evidence                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider and capacity | Stable model/config snapshot, missing/invalid key, unavailable model, 429, transient 5xx, empty/truncated/schema-invalid output, cancellation, slot release, two-request concurrency, nested verification without deadlock. |
| Assessment            | Exact citation validation, deterministic eligibility, job/profile changes discard stale results, pause/configured behavior, queued lease/retry semantics.                                                                   |
| Resume                | PDF/text import, excerpts and catalog mapping, no invented links/preferences, user draft review, failed extraction leaves profile unchanged.                                                                                |
| Summary               | Progressive provisional text, validated persisted final metadata, cache hit, regenerate, job-version race, navigation/abort, Unicode boundaries, midstream provider/transport error, old summary retained.                  |
| Research              | All four run kinds, saved-evidence Q&A cannot invoke tools, web-enabled calls work, bounded loops/inspection, citation repair/rejection, untrusted evidence, previous data retained, explicit cancel and restart.           |
| Event UI              | Snapshot semantics, persisted draft seed, replay cursor/duplicates, no cross-company events, reconnect, terminal state and accessible retry/stop.                                                                           |
| Desktop and server    | V1 settings upgrade, Go key isolated from old key, save/clear/redaction, runtime changes, Compose setup, PostgreSQL and SQLite, packaged desktop startup.                                                                   |

Expected repository commands after implementation (supply isolated DB configuration where required):

```sh
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run check-types
bun --cwd apps/web test
bun --cwd apps/crawler test
APP_ENV=test NODE_ENV=test bun --cwd apps/backend test
bun run verify:sqlite
bun run build
bun --cwd apps/desktop run package:dir
```

The backend test wrapper creates/drops a disposable database; use an appropriate test PostgreSQL account and never the production database. Add new tests to a command actually invoked by CI. Use existing desktop CI/release smoke steps for packaged verification; do not invent a successful live test when credentials or services are absent.

## 6. Commit and PR sequence

Use descriptive branch names without a T3 prefix, such as `migrate-ai-sdk`. Keep commit subjects and PR titles lowercase with a concise prefix. Commit after each passing vertical slice, not every file save. Suggested sequence:

1. `chore: add vercel ai sdk and provider configuration`
2. `refactor: centralize ai generation and request capacity`
3. `refactor: migrate structured ai features to sdk`
4. `fix: migrate job summary streaming and cancellation`
5. `refactor: migrate research and link tools to sdk agents`
6. `fix: harden research stream state and recovery`
7. `feat: configure opencode go in desktop settings`
8. `chore: remove legacy ai transport and update deployment docs`
9. `test: verify ai migration across desktop and server`

Keep each commit type-correct when practical, with temporary compatibility adapters removed before the final PR. Record actual validation per slice. Suggested final PR title: `refactor: migrate ai features to vercel ai sdk`.

The planning checkout is based on the still-open desktop migration branch (`t3/surface-desktop-migration`, PR #1), 28 commits ahead of `master` at inspection. Its documentation PR must target that branch to avoid including the desktop implementation. For execution, start from the integrated planning/desktop baseline; if desktop is merged first, use updated `master`. Do not accidentally include unrelated desktop changes in the AI implementation PR.

For rollback, retain the pre-migration commit and a backup of settings/database files. Application code can be reverted; version-2 settings require the backup or an explicit reverse migration. Do not delete reports/evidence or perform destructive database migrations merely to adopt SDK message types.

## 7. Handoff instructions

Give the next thread this plan and `docs/ai-sdk-inventory.md`. Ask it to execute phases in dependency order, use the upstream skills and installed package docs, commit incrementally and raise the final PR. No migration implementation has been authorized for this planning thread. The only remaining user-supplied input for live provider verification is a securely delivered OpenCode Go key; do not collect it just to review this plan.

References: [Vercel skills source](https://github.com/vercel/ai), [structured generation](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data), [agents](https://ai-sdk.dev/docs/agents/overview), [compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers), [React streaming](https://ai-sdk.dev/docs/ai-sdk-ui/completion), [OpenCode Go](https://opencode.ai/docs/console/go/), [live model catalog](https://opencode.ai/inference/go/v1/models). Recheck installed docs and live provider metadata when implementation starts.
