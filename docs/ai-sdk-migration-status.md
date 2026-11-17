# AI SDK migration status

Implementation branch baseline: `12c4832` (planning + desktop migration).
Implemented on `migrate-ai-sdk`.

## Delivered

- Shared provider, typed generation, error normalization, request admission and
  bounded transport in `apps/backend/src/shared/ai/`.
- Structured assessment, résumé extraction and company matching use
  `generateText` with `Output.object`.
- Job summaries stream through `streamText` + `Output.object` and an AI SDK UI
  message stream. The non-streaming summary endpoint remains available.
- Research report, summary, saved-evidence Q&A and link verification use
  `ToolLoopAgent` with typed `tool()` values. Web Q&A can still run without any
  web tools.
- Evidence, citation, résumé excerpt, eligibility, source ownership, duplicate
  link, category and publication validation remain application code.
- Version-2 desktop settings store separate OpenCode Go credentials. Version-1
  files are backed up to `settings.json.v1.backup.json`; the old OmniRoute key
  stays in a legacy section and is never used for AI calls.
- Diagnostics report endpoint reachability and authenticated model access
  separately. No paid generation is triggered by diagnostics.

## Provider catalog check

Checked 2026-11-17 at <https://opencode.ai/inference/go/v1/models>:

| Value             | Result                                             |
| ----------------- | -------------------------------------------------- |
| Model ID          | `deepseek-v4.1-flash`                              |
| Base URL          | `https://opencode.ai/inference/go/openai/v1`       |
| AI SDK            | `@ai-sdk/openai-compatible`                        |
| Structured output | advertised                                         |
| Tools             | advertised, choices include `auto`, `none`, `tool` |
| Reasoning         | supported with `reasoning_content`                 |

Installed versions: `ai` 7.0.173, `@ai-sdk/openai-compatible` 3.0.92.

## Local validation

| Check                                                                               | Result                                  |
| ----------------------------------------------------------------------------------- | --------------------------------------- |
| `bun run format:check`                                                              | passed                                  |
| `bun run lint`                                                                      | passed                                  |
| `bun run check-types`                                                               | passed                                  |
| `bun --cwd apps/web test`                                                           | 39 passed                               |
| `bun --cwd apps/crawler test`                                                       | 7 passed                                |
| `APP_ENV=test NODE_ENV=test bun --cwd apps/backend test` with disposable PostgreSQL | 58 passed                               |
| `bun run verify:sqlite`                                                             | passed                                  |
| `bun run build`                                                                     | passed                                  |
| `bun --cwd apps/desktop package:dir`                                                | passed                                  |
| Packaged backend on SQLite                                                          | `/api/health` returned `200` under Node |

The backend suite includes new offline coverage for provider request shape,
schema output, streaming partials, aborts, rate limits, incomplete output,
oversized responses, capacity release, summary streaming/caching/failure, and
research tool loops. No test calls a paid provider.

## Pending live verification

No OpenCode Go key was available for this implementation run, so these remain
unverified against the live service:

- an authenticated request with the user's Go key;
- streaming and non-streaming generation with the live model;
- strict `json_schema` structured output and tool use in the same account;
- `reasoning_content` continuity across multi-step tool turns;
- live 401/403/429/5xx wording and account allowance behavior.

Run a small opt-in smoke test with a securely supplied key before relying on the
migration in production. Do not put the key in fixtures, logs, Vite variables or
committed files.

## Rollback

Revert the implementation commits, restore the previous `settings.json.v1.backup.json`
if a desktop install was migrated, and keep the existing SQLite/PostgreSQL data.
No database migration was required for this change.
